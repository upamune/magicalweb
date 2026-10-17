// Subject lift (like Photos "Lift subject"), local Apple Vision only: writes each foreground instance and the union as cropped RGBA PNGs.
import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 else { fatalError("usage: lift_subject INPUT.png OUTPUT_PREFIX") }
let url = URL(fileURLWithPath: args[1])
let prefix = args[2]
guard let ci = CIImage(contentsOf: url) else { fatalError("cannot read input") }
let handler = VNImageRequestHandler(ciImage: ci)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result = request.results?.first else { print("{\"instances\":0}"); exit(0) }
let ctx = CIContext()
func write(_ buffer: CVPixelBuffer, _ path: String) throws {
    let image = CIImage(cvPixelBuffer: buffer)
    guard let cg = ctx.createCGImage(image, from: image.extent) else { return }
    let rep = NSBitmapImageRep(cgImage: cg)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}
var rows: [String] = []
for index in result.allInstances {
    let buffer = try result.generateMaskedImage(ofInstances: IndexSet(integer: index), from: handler, croppedToInstancesExtent: true)
    let path = "\(prefix)-i\(index).png"
    try write(buffer, path)
    rows.append("{\"instance\":\(index),\"w\":\(CVPixelBufferGetWidth(buffer)),\"h\":\(CVPixelBufferGetHeight(buffer)),\"path\":\"\(path)\"}")
}
let all = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
try write(all, "\(prefix)-all.png")
print("{\"instances\":[\(rows.joined(separator: ","))]}")

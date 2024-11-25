import React from 'react';
import { getMerchandise } from '../utils/config';

export default function MerchGrid() {
  const merchandise = getMerchandise();

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {merchandise.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
        >
          <div className="aspect-video overflow-hidden">
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="p-6">
            <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
              {item.name}
            </h3>
            <p className="text-primary text-lg font-semibold">
              ¥{item.price.toLocaleString()}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
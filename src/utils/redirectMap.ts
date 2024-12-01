import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RedirectConfigSchema, type RedirectRule } from '../types/redirect';

export class RedirectMap {
  private redirectMap: Map<string, RedirectRule>;
  private static instance: RedirectMap;

  private constructor() {
    this.redirectMap = new Map();
    this.loadRedirects();
  }

  public static getInstance(): RedirectMap {
    if (!RedirectMap.instance) {
      RedirectMap.instance = new RedirectMap();
    }
    return RedirectMap.instance;
  }

  private loadRedirects(): void {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const configPath = join(__dirname, '../src/config/redirects.yaml');
      
      const yamlContent = readFileSync(configPath, 'utf8');
      const parsedConfig = parse(yamlContent);
      
      const validatedConfig = RedirectConfigSchema.parse(parsedConfig);
      
      for (const rule of validatedConfig.redirects) {
        this.redirectMap.set(rule.source, rule);
      }
    } catch (error) {
      console.error('Error loading redirects:', error);
      throw new Error('Failed to load redirect configuration');
    }
  }

  public getRedirect(path: string): RedirectRule | undefined {
    return this.redirectMap.get(path);
  }

  public hasRedirect(path: string): boolean {
    return this.redirectMap.has(path);
  }
}
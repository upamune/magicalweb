import { parse } from 'yaml';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(__dirname, '../config/site.yaml');
const configFile = fs.readFileSync(configPath, 'utf8');

export const config = parse(configFile);

export type SiteConfig = typeof config;

// Helper functions to access config values
export function getSiteInfo() {
  return config.site;
}

export function getSocialLinks() {
  return config.social;
}

export function getHosts() {
  return config.hosts;
}

export function getPlatforms() {
  return config.platforms;
}

export function getMerchandise() {
  return config.merchandise;
}

// Type-safe config access
export function getConfig<K extends keyof SiteConfig>(key: K): SiteConfig[K] {
  return config[key];
}

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ShopifyAppRequirement } from './schema';
import { ShopifyAppRequirementRegistrySchema } from './schema';

const REGISTRY_FILE = join(__dirname, 'requirements.json');

export function getShopifyAppRequirements(): ShopifyAppRequirement[] {
  const data = readFileSync(REGISTRY_FILE, 'utf-8');
  const parsed: unknown = JSON.parse(data);

  // Validate the registry wrapper structure
  const registry = ShopifyAppRequirementRegistrySchema.parse(parsed);
  return registry.requirements;
}

export type { ShopifyAppRequirement } from './schema';

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// A place for shared utility functions

/**
 * Generates a unique, colorful SVG avatar URL based on a string seed.
 * Uses Dicebear for robust, deterministic avatar generation.
 * @param seed - A unique string, like a user's wallet address.
 * @returns A URL pointing to the generated SVG avatar.
 */
export const generateAvatarUrl = (seed: string): string => {
  if (!seed) {
    // Return a default or placeholder avatar if the seed is empty
    return `https://api.dicebear.com/7.x/pixel-art/svg?seed=placeholder`;
  }
  // Use Dicebear for more robust avatar generation
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`;
};

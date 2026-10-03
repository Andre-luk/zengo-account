import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusionne des classes Tailwind en gerant les conflits. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

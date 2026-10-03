import { Transform } from 'class-transformer';

/**
 * Convertit une valeur de query string en booleen de facon explicite.
 * (`enableImplicitConversion` n'est volontairement pas active : il rendrait
 * `unassignedOnly=false` truthy.)
 */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  });

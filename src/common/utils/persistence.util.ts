import { ObjectLiteral, QueryDeepPartialEntity, Repository } from 'typeorm';

/**
 * Extrait uniquement les *colonnes* mappees d'une entite, en excluant la cle
 * primaire et toutes les relations.
 */
export const extractColumns = <T extends ObjectLiteral>(
  repository: Repository<T>,
  entity: T,
): QueryDeepPartialEntity<T> => {
  const patch: Record<string, unknown> = {};

  for (const column of repository.metadata.columns) {
    if (!column.propertyName || column.isPrimary) continue;
    patch[column.propertyName] = (entity as unknown as Record<string, unknown>)[column.propertyName];
  }

  return patch as QueryDeepPartialEntity<T>;
};

/**
 * Persiste une entite deja chargee **sans toucher a ses relations**.
 *
 * ⚠️ Piege TypeORM : `repository.save(entity)` sur une entite dont une relation
 * inverse (OneToMany / OneToOne non proprietaire) a ete chargee pousse TypeORM
 * a reconstruire les enfants avec leur cle etrangere a `NULL` — ce qui casse
 * silencieusement les liens existants. On passe donc par `update()` sur les
 * seules colonnes mappees.
 */
export const saveColumns = async <T extends ObjectLiteral>(
  repository: Repository<T>,
  entity: T,
): Promise<void> => {
  const id = (entity as unknown as { id?: string }).id;
  if (!id) return;
  await repository.update(id, extractColumns(repository, entity));
};

import { Repository } from 'typeorm';
import { extractColumns, saveColumns } from './persistence.util';

interface FakeEntity {
  id: string;
  status: string;
  clientId: string | null;
  dispatches?: unknown[];
  client?: unknown;
}

const buildRepository = () =>
  ({
    metadata: {
      columns: [
        { propertyName: 'id', isPrimary: true },
        { propertyName: 'createdAt', isPrimary: false },
        { propertyName: 'status', isPrimary: false },
        { propertyName: 'clientId', isPrimary: false },
      ],
    },
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }) as unknown as Repository<FakeEntity> & { update: jest.Mock };

describe('extractColumns', () => {
  it('ne retient que les colonnes mappees, hors cle primaire', () => {
    const repository = buildRepository();
    const entity: FakeEntity = {
      id: 'alert-1',
      status: 'NEW',
      clientId: 'client-1',
      dispatches: [{ id: 'dispatch-1' }],
      client: { id: 'client-1' },
    };

    const patch = extractColumns(repository, entity);

    expect(patch).toEqual({ createdAt: undefined, status: 'NEW', clientId: 'client-1' });
    expect(patch).not.toHaveProperty('id');
    expect(patch).not.toHaveProperty('dispatches');
    expect(patch).not.toHaveProperty('client');
  });
});

describe('saveColumns', () => {
  it('met a jour l entite par son identifiant sans toucher aux relations', async () => {
    const repository = buildRepository();
    const entity: FakeEntity = { id: 'alert-1', status: 'RESOLVED', clientId: null, dispatches: [] };

    await saveColumns(repository, entity);

    expect(repository.update).toHaveBeenCalledTimes(1);
    const [id, patch] = repository.update.mock.calls[0];
    expect(id).toBe('alert-1');
    expect(patch).toEqual({ createdAt: undefined, status: 'RESOLVED', clientId: null });
    expect(patch).not.toHaveProperty('dispatches');
  });

  it('ignore les entites sans identifiant', async () => {
    const repository = buildRepository();
    await saveColumns(repository, { status: 'NEW' } as unknown as FakeEntity);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

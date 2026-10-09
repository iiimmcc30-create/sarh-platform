import { ensurePayableListingFee } from './listing-fee-ensure';

type FeeRow = { id: string; listingId: string; userId: string; status: string };
type ListingRow = {
  id: string;
  sellerId: string | null;
  origin: 'USER' | 'ADMIN_MANAGED';
  deletedAt: Date | null;
  category: string;
  quantity: number;
  price: number;
};

/** In-memory fake honouring ListingFee.listingId @unique (P2002 on duplicate). */
function makeDb(listings: ListingRow[], seed: FeeRow[] = []) {
  const fees: FeeRow[] = seed;
  const db = {
    fees,
    listingFee: {
      findFirst: jest.fn(
        async ({
          where,
        }: any): Promise<Pick<
          FeeRow,
          'id' | 'listingId' | 'status'
        > | null> => {
          const ors: Array<Record<string, string>> = where.OR ?? [where];
          const row: FeeRow | undefined = fees.find(
            (f: FeeRow) =>
              (where.userId === undefined || f.userId === where.userId) &&
              ors.some((o) =>
                Object.entries(o)
                  .filter(([k]) => k === 'id' || k === 'listingId')
                  .every(([k, v]) => (f as any)[k] === v),
              ),
          );
          return row
            ? { id: row.id, listingId: row.listingId, status: row.status }
            : null;
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: any): Promise<Pick<FeeRow, 'id' | 'listingId' | 'status'>> => {
          if (fees.some((f: FeeRow) => f.listingId === data.listingId)) {
            throw Object.assign(new Error('Unique constraint failed'), {
              code: 'P2002',
            });
          }
          const row: FeeRow = { id: `fee-${fees.length + 1}`, ...data };
          fees.push(row);
          return { id: row.id, listingId: row.listingId, status: row.status };
        },
      ),
    },
    listing: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          listings.find((l) => l.id === where.id) ?? null,
      ),
    },
  };
  return db;
}

const legacy: ListingRow = {
  id: 'l1',
  sellerId: 'owner',
  origin: 'USER',
  deletedAt: null,
  category: 'camels',
  quantity: 2,
  price: 5000,
};

describe('ensurePayableListingFee', () => {
  it('lazily creates a pending fee for the owner of a legacy listing, same shape as publish', async () => {
    const db = makeDb([legacy]);
    const fee = await ensurePayableListingFee(db as never, {
      referenceId: 'l1',
      userId: 'owner',
      listingFeesEnabled: true,
    });
    expect(fee).toMatchObject({
      listingId: 'l1',
      status: 'pending',
      created: true,
    });
    expect(db.listingFee.create).toHaveBeenCalledWith({
      data: {
        listingId: 'l1',
        userId: 'owner',
        category: 'camels',
        quantity: 2,
        price: 5000,
        commission: 50,
        dueDate: null,
        status: 'pending',
      },
      select: { id: true, listingId: true, status: true },
    });
  });

  it('is idempotent: a second call reuses the row instead of creating another', async () => {
    const db = makeDb([legacy]);
    const a = await ensurePayableListingFee(db as never, {
      referenceId: 'l1',
      userId: 'owner',
      listingFeesEnabled: true,
    });
    const b = await ensurePayableListingFee(db as never, {
      referenceId: 'l1',
      userId: 'owner',
      listingFeesEnabled: true,
    });
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(false);
    expect(db.listingFee.create).toHaveBeenCalledTimes(1);
    expect(db.fees).toHaveLength(1);
  });

  it('handles a concurrent create (P2002) by re-reading the winner row', async () => {
    const db = makeDb([legacy]);
    const [a, b] = await Promise.all([
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ]);
    expect(a.id).toBe(b.id);
    expect(db.fees).toHaveLength(1);
  });

  it('never creates a fee for someone who does not own the listing', async () => {
    const db = makeDb([legacy]);
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'eve',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'fee_not_found', status: 404 });
    expect(db.listingFee.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown listing', async () => {
    const db = makeDb([]);
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'nope',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'fee_not_found', status: 404 });
  });

  it('does not create a fee for a deleted listing', async () => {
    const db = makeDb([{ ...legacy, deletedAt: new Date() }]);
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'listing_deleted' });
    expect(db.listingFee.create).not.toHaveBeenCalled();
  });

  it('still lets the owner pay an existing pending fee on a deleted listing', async () => {
    const db = makeDb(
      [{ ...legacy, deletedAt: new Date() }],
      [{ id: 'fee-x', listingId: 'l1', userId: 'owner', status: 'overdue' }],
    );
    const fee = await ensurePayableListingFee(db as never, {
      referenceId: 'l1',
      userId: 'owner',
      listingFeesEnabled: true,
    });
    expect(fee).toMatchObject({
      id: 'fee-x',
      status: 'overdue',
      created: false,
    });
  });

  it('does not create a fee for an ADMIN_MANAGED listing', async () => {
    const db = makeDb([
      { ...legacy, origin: 'ADMIN_MANAGED', sellerId: 'owner' },
    ]);
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'fee_not_applicable', status: 409 });
    expect(db.listingFee.create).not.toHaveBeenCalled();
  });

  it('does not create a fee while listing fees are disabled', async () => {
    const db = makeDb([legacy]);
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: false,
      }),
    ).rejects.toMatchObject({ error: 'service_disabled', status: 403 });
    expect(db.listingFee.create).not.toHaveBeenCalled();
  });

  it('rejects a PAID fee with fee_already_paid', async () => {
    const db = makeDb(
      [legacy],
      [{ id: 'fee-p', listingId: 'l1', userId: 'owner', status: 'paid' }],
    );
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'l1',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'fee_already_paid', status: 409 });
    expect(db.listingFee.create).not.toHaveBeenCalled();
  });

  it('rejects a WAIVED fee as not applicable', async () => {
    const db = makeDb(
      [legacy],
      [{ id: 'fee-w', listingId: 'l1', userId: 'owner', status: 'waived' }],
    );
    await expect(
      ensurePayableListingFee(db as never, {
        referenceId: 'fee-w',
        userId: 'owner',
        listingFeesEnabled: true,
      }),
    ).rejects.toMatchObject({ error: 'fee_not_applicable' });
  });
});

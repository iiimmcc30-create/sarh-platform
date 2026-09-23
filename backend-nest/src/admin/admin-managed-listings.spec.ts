import { AdminService } from './admin.service';
import { createManagedListingSchema } from './dto/admin.dto';
import { managedContactFields } from './lib/managed-listing';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { readFileSync } from 'fs';
import path from 'path';

const actor: JwtPayload = {
  userId: 'admin-1',
  username: 'admin',
  role: 'ADMIN',
};

function sampleBody(n: number) {
  return {
    displayUsername: `user${43478 + n}`,
    displaySellerName: 'محمد العتيبي',
    displayPhone: '0500000000',
    displayRegion: 'الدمام',
    category: 'camels',
    title: `حاشي للبيع ${n}`,
    description: 'إعلان مُدار من الإدارة للبيع',
    price: 15000,
    images: ['https://cdn.example.com/camel.jpg'],
  };
}

describe('managed listings do not create users', () => {
  const created: Array<Record<string, unknown>> = [];
  let userCount = 40;
  const userCreate = jest.fn();
  const cache = {
    del: jest.fn().mockResolvedValue(1),
    delPattern: jest.fn().mockResolvedValue(1),
  };
  const repo = {
    countUsers: jest.fn(async () => userCount),
    userCreate,
    createManagedListing: jest.fn(async (data: Record<string, unknown>) => {
      created.push(data);
      return { id: `listing-${created.length}`, ...data, seller: null };
    }),
    findListingOrigin: jest.fn(),
    updateManagedListing: jest.fn(),
    softDeleteListingRecorded: jest.fn(),
  };

  const service = new AdminService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    cache as never,
  );

  beforeEach(() => {
    created.length = 0;
    userCount = 40;
    jest.clearAllMocks();
    repo.countUsers.mockImplementation(async () => userCount);
  });

  it('creates 30 managed listings and leaves the user count unchanged', async () => {
    const before = await repo.countUsers();
    for (let i = 0; i < 30; i += 1) {
      await service.createManagedListing(actor, sampleBody(i));
    }
    const after = await repo.countUsers();
    expect(before).toBe(40);
    expect(after).toBe(40);
    expect(created).toHaveLength(30);
    expect(userCreate).not.toHaveBeenCalled();
    for (const row of created) {
      expect(row.sellerId).toBeNull();
      expect(row.origin).toBe('ADMIN_MANAGED');
      expect(row.contactPhone).toBe(row.displayPhone);
      expect(row.location).toBe(row.displayRegion);
      expect(row.arabicLocation).toBe(row.displayRegion);
    }
    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).toHaveBeenCalledWith('search:explore:*');
    expect(cache.delPattern).toHaveBeenCalledWith('search:unified:*');
  });

  it('rejects sellerId and origin spoofing on create', () => {
    const parsed = createManagedListingSchema.safeParse({
      ...sampleBody(1),
      sellerId: '00000000-0000-0000-0000-000000000000',
      origin: 'USER',
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses to convert a real-user listing into a managed listing', async () => {
    repo.findListingOrigin.mockResolvedValue({
      id: 'real-1',
      origin: 'USER',
      sellerId: 'user-9',
      displayUsername: null,
      displaySellerName: null,
      displayPhone: null,
      displayRegion: null,
      arabicTitle: 'إعلان',
      arabicDescription: 'وصف الإعلان',
      price: 10,
      category: 'sheep',
      images: ['https://cdn.example.com/a.jpg'],
      videoUrl: null,
      thumbnailUrl: null,
    });
    await expect(
      service.updateManagedListing(actor, 'real-1', { title: 'عنوان جديد' }),
    ).rejects.toMatchObject({ error: 'not_managed_listing' });
    expect(repo.updateManagedListing).not.toHaveBeenCalled();
  });

  it('updates a managed listing and keeps phone and region in sync', async () => {
    repo.findListingOrigin.mockResolvedValue({
      id: 'm-1',
      origin: 'ADMIN_MANAGED',
      sellerId: null,
      displayUsername: 'user43478',
      displaySellerName: 'محمد',
      displayPhone: '0500000000',
      displayRegion: 'الدمام',
      arabicTitle: 'حاشي',
      arabicDescription: 'وصف الإعلان هنا',
      price: 15000,
      category: 'camels',
      images: ['https://cdn.example.com/camel.jpg'],
      videoUrl: null,
      thumbnailUrl: null,
    });
    repo.updateManagedListing.mockImplementation(
      async (_id: string, data: Record<string, unknown>) => data,
    );
    await service.updateManagedListing(actor, 'm-1', {
      displayPhone: '0555555555',
      displayRegion: 'الخبر',
    });
    const data = repo.updateManagedListing.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(data.sellerId).toBeNull();
    expect(data.displayPhone).toBe('0555555555');
    expect(data.contactPhone).toBe('0555555555');
    expect(data.displayRegion).toBe('الخبر');
    expect(data.location).toBe('الخبر');
    expect(data.arabicLocation).toBe('الخبر');
    expect(repo.updateManagedListing.mock.calls[0][2]).toBe('admin-1');
  });

  it('records delete activity only through the managed delete path', async () => {
    repo.findListingOrigin.mockResolvedValue({
      id: 'm-1',
      origin: 'ADMIN_MANAGED',
      sellerId: null,
    });
    repo.softDeleteListingRecorded.mockResolvedValue({ id: 'm-1' });
    await service.deleteListing('m-1', actor);
    expect(repo.softDeleteListingRecorded).toHaveBeenCalledWith(
      'm-1',
      'admin-1',
      true,
    );
    expect(cache.del).toHaveBeenCalledWith('listing:m-1');
  });

  it('keeps contact columns equal to display identity', () => {
    const fields = managedContactFields({
      displayUsername: ' user43478 ',
      displaySellerName: ' محمد ',
      displayPhone: '0500000000',
      displayRegion: ' الدمام ',
    });
    expect(fields.sellerId).toBeNull();
    expect(fields.contactPhone).toBe(fields.displayPhone);
    expect(fields.location).toBe(fields.displayRegion);
    expect(fields.arabicLocation).toBe(fields.displayRegion);
  });
});

describe('managed listing migration and admin route', () => {
  it('declares the origin check and does not create users', () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        '../../prisma/migrations/20260922120000_admin_managed_listings/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('Listing_origin_identity_check');
    expect(sql).toContain("origin\" = 'USER'");
    expect(sql).toContain("origin\" = 'ADMIN_MANAGED'");
    expect(sql).toContain('"sellerId" IS NULL');
    expect(sql).toContain('"sellerId" IS NOT NULL');
    expect(sql).not.toMatch(/INSERT INTO "User"/i);
    expect(sql).toContain('ALTER COLUMN "sellerId" DROP NOT NULL');
  });

  it('exposes staff-only managed routes and does not call User.create', () => {
    const controller = readFileSync(
      path.join(__dirname, 'admin.controller.ts'),
      'utf8',
    );
    const service = readFileSync(
      path.join(__dirname, 'admin.service.ts'),
      'utf8',
    );
    const repoSrc = readFileSync(
      path.join(__dirname, 'repositories/admin.repository.ts'),
      'utf8',
    );
    expect(controller).toContain("@Post('listings/managed')");
    expect(controller).toContain("@Patch('listings/:id/managed')");
    expect(controller).toContain('@Roles(...STAFF)');
    expect(service).not.toContain('user.create');
    expect(service).not.toContain('prisma.user.create');
    expect(repoSrc).toContain('ADMIN_MANAGED_LISTING_CREATED');
    expect(repoSrc).toContain('ADMIN_MANAGED_LISTING_UPDATED');
    expect(repoSrc).toContain('ADMIN_MANAGED_LISTING_DELETED');
  });
});

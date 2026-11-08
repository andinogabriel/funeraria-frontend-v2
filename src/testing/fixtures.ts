import type { Affiliate } from '../app/features/affiliates/affiliate.types';
import type { AuditEvent } from '../app/features/audit/audit.types';
import type { Brand } from '../app/features/brands/brand.types';
import type { Category } from '../app/features/categories/category.types';
import type { Funeral } from '../app/features/funerals/funeral.types';
import type { Income } from '../app/features/incomes/income.types';
import type { Item } from '../app/features/items/item.types';
import type { Notification } from '../app/features/notifications/notification.types';
import type { Plan } from '../app/features/plans/plan.types';
import type { Supplier } from '../app/features/suppliers/supplier.types';

/** Domain fixtures shared by page specs. Overrides let a test pin the field it cares about. */
export const brand = (o: Partial<Brand> = {}): Brand =>
  ({ id: 1, name: 'Akme', webPage: null, ...o }) as Brand;

export const category = (o: Partial<Category> = {}): Category =>
  ({ id: 1, name: 'Cofres', description: null, ...o }) as Category;

export const item = (o: Partial<Item> = {}): Item => ({
  id: 1,
  name: 'Cofre Standard',
  description: null,
  code: 'COF-001',
  price: 150000,
  itemLength: null,
  itemHeight: null,
  itemWidth: null,
  stock: 12,
  itemImageLink: null,
  brand: brand(),
  category: category(),
  createdAt: '2026-11-01T10:00:00Z',
  createdBy: 'admin@funeraria.local',
  updatedAt: null,
  updatedBy: null,
  lowStockThreshold: 5,
  ...o,
});

export const supplier = (o: Partial<Supplier> = {}): Supplier =>
  ({
    name: 'Proveedora Norte',
    nif: '30-11111111-1',
    webPage: null,
    email: 'ventas@norte.com',
    mobileNumbers: [{ id: 1, mobileNumber: '1155554444' }],
    addresses: [],
    ...o,
  }) as Supplier;

export const income = (o: Partial<Income> = {}): Income =>
  ({
    id: 10,
    receiptNumber: '9001',
    receiptSeries: '1',
    incomeDate: '2026-11-01T10:00:00Z',
    lastModifiedDate: '2026-11-01T10:00:00Z',
    tax: 21,
    totalAmount: 50000,
    receiptType: { id: 1, name: 'Factura A' },
    supplier: supplier(),
    incomeUser: { email: 'admin@funeraria.local', firstName: 'Admin', lastName: 'Test' },
    lastModifiedBy: null,
    incomeDetails: [
      {
        quantity: 2,
        purchasePrice: 1000,
        salePrice: 1500,
        item: { code: 'COF-001', name: 'Cofre' },
      },
    ],
    status: 'ACTIVE',
    reversalOfId: null,
    ...o,
  }) as Income;

export const plan = (o: Partial<Plan> = {}): Plan =>
  ({
    id: 3,
    name: 'Plan Standard',
    description: 'Servicio completo',
    imageUrl: null,
    price: 900000,
    profitPercentage: 30,
    itemsPlan: [
      { item: { id: 1, code: 'COF-001', name: 'Cofre Standard', price: 150000 }, quantity: 1 },
    ],
    ...o,
  }) as Plan;

export const funeral = (o: Partial<Funeral> = {}): Funeral =>
  ({
    id: 5,
    funeralDate: '2026-11-05T10:00:00',
    registerDate: '2026-11-04T09:00:00',
    receiptNumber: 'F-1001',
    receiptSeries: '1',
    tax: 21,
    totalAmount: 900000,
    receiptType: { id: 1, name: 'Factura A' },
    deceased: {
      id: 9,
      firstName: 'Juan',
      lastName: 'Perez',
      dni: 30111222,
      affiliated: false,
      birthDate: '1950-01-01',
      deathDate: '2026-11-03',
      registerDate: '2026-11-04T09:00:00',
      placeOfDeath: {
        id: 1,
        streetName: 'Calle 7',
        blockStreet: 100,
        apartment: 'A',
        flat: '2',
        city: { id: 10, name: 'La Plata', province: { id: 1, name: 'Buenos Aires' } },
      },
      gender: { id: 1, name: 'Masculino' },
      deceasedRelationship: { id: 1, name: 'Padre' },
      deathCause: { id: 1, name: 'Natural' },
      deceasedUser: { email: 'deudo@x.com', firstName: 'Deudo', lastName: 'Uno' },
    },
    plan: plan(),
    deletedAt: null,
    deletedBy: null,
    ...o,
  }) as Funeral;

export const affiliate = (o: Partial<Affiliate> = {}): Affiliate =>
  ({
    firstName: 'Ana',
    lastName: 'Gomez',
    dni: 40111222,
    birthDate: '1980-05-10',
    startDate: '2026-01-10',
    deceased: false,
    gender: { id: 2, name: 'Femenino' },
    relationship: { id: 1, name: 'Madre' },
    deletedAt: null,
    deletedBy: null,
    ...o,
  }) as Affiliate;

export const auditEvent = (o: Partial<AuditEvent> = {}): AuditEvent =>
  ({
    id: 77,
    occurredAt: '2026-11-08T12:00:00Z',
    actorEmail: 'admin@funeraria.local',
    actorId: 1,
    action: 'FUNERAL_CREATED',
    targetType: 'FUNERAL',
    targetId: '5',
    traceId: 'abc',
    correlationId: null,
    payload: '{"id":5}',
    ...o,
  }) as AuditEvent;

export const lowStockNotification = (o: Partial<Notification> = {}): Notification =>
  ({
    id: 1,
    type: 'LOW_STOCK_REACHED',
    audience: 'ROLE_ADMIN',
    payload: {
      itemId: 1,
      code: 'VEL-1',
      name: 'Vela',
      threshold: 5,
      stockBefore: 6,
      stockAfter: 4,
    },
    createdAt: '2026-11-08T12:00:00Z',
    readAt: null,
    ...o,
  }) as Notification;

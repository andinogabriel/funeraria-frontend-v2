/**
 * One entry of the authenticated navigation. Shared by the sidenav and the command palette so
 * both offer exactly the same destinations to the same roles.
 *
 * - `requiresAdmin` hides the entry unless the session has `ROLE_ADMIN` (the backend would
 *   answer 403 anyway, but offering a link that always fails is bad UX).
 * - `requiresUser` hides the entry unless the session has `ROLE_USER`. Only `Mis servicios`
 *   uses it: `GET /funerals/by-user` is gated to ROLE_USER, and an admin without that role
 *   already sees the full `/servicios` grid.
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly requiresAdmin?: boolean;
  readonly requiresUser?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/afiliados', label: 'Afiliados', icon: 'group' },
  { path: '/servicios', label: 'Servicios', icon: 'church' },
  { path: '/mis-servicios', label: 'Mis servicios', icon: 'person_pin', requiresUser: true },
  { path: '/planes', label: 'Planes', icon: 'workspace_premium' },
  { path: '/items', label: 'Items', icon: 'inventory_2' },
  { path: '/marcas', label: 'Marcas', icon: 'sell' },
  { path: '/categorias', label: 'Categorías', icon: 'category' },
  { path: '/proveedores', label: 'Proveedores', icon: 'local_shipping', requiresAdmin: true },
  { path: '/ingresos', label: 'Ingresos', icon: 'receipt_long', requiresAdmin: true },
  {
    path: '/arqueo',
    label: 'Arqueo diario',
    icon: 'account_balance_wallet',
    requiresAdmin: true,
  },
  {
    path: '/titulares',
    label: 'Titulares y cuotas',
    icon: 'family_restroom',
    requiresAdmin: true,
  },
  { path: '/tarifario', label: 'Tarifario', icon: 'payments', requiresAdmin: true },
  { path: '/auditoria', label: 'Auditoría', icon: 'policy', requiresAdmin: true },
];

/** Whether a session with these authorities may see the entry. */
export function isNavItemVisible(
  item: Pick<NavItem, 'requiresAdmin' | 'requiresUser'>,
  authorities: readonly string[],
): boolean {
  if (item.requiresAdmin && !authorities.includes('ROLE_ADMIN')) {
    return false;
  }
  return !(item.requiresUser && !authorities.includes('ROLE_USER'));
}

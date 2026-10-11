import Link from 'next/link';
import { IconGrid, IconShield, IconGear } from './icons';
import { IconCart, IconBox, IconTruck, IconFileText, IconDollar, IconFactory, IconPackage, IconUser, IconUsers, IconKey, IconServer, IconReceipt } from './icons';
import { cx } from './ui';
import type { MessageKey, Translator } from '../i18n/config';

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: typeof IconGrid;
}

export function navItemsFor(t: Translator, locale: string): NavItem[] {
  const root = `/${locale}`;
  return [
    { key: 'dashboard', label: t('navDashboard'), href: `${root}/dashboard`, icon: IconGrid },
    {
      key: 'permissions',
      label: t('navPermissions'),
      href: `${root}/permissions`,
      icon: IconShield,
    },
    { key: 'settings', label: t('navSettings'), href: `${root}/settings`, icon: IconGear },
    // Sales & Documents
    { key: 'sales-orders', label: t('navSalesOrders'), href: `${root}/sales-orders`, icon: IconCart },
    { key: 'delivery-notes', label: t('navDeliveryNotes'), href: `${root}/delivery-notes`, icon: IconTruck },
    { key: 'customer-invoices', label: t('navCustomerInvoices'), href: `${root}/customer-invoices`, icon: IconFileText },
    { key: 'credit-notes', label: t('navCreditNotes'), href: `${root}/credit-notes`, icon: IconReceipt },
    // Stock & Catalog
    { key: 'items', label: t('navItems'), href: `${root}/items`, icon: IconBox },
    { key: 'parties', label: t('navParties'), href: `${root}/parties`, icon: IconUsers },
    { key: 'stock', label: t('navStock'), href: `${root}/stock`, icon: IconServer },
    // Purchasing & Production
    { key: 'purchasing', label: t('navPurchasing'), href: `${root}/purchasing`, icon: IconPackage },
    { key: 'production', label: t('navProduction'), href: `${root}/production`, icon: IconFactory },
    { key: 'boms', label: t('navBoms'), href: `${root}/boms`, icon: IconServer },
    // Finance
    { key: 'payments', label: t('navPayments'), href: `${root}/payments`, icon: IconDollar },
  ];
}

export function AppNav({
  items,
  currentPath,
  label,
  onNavigate,
}: {
  items: NavItem[];
  currentPath: string;
  label: string;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map(({ key, label, href, icon: Icon }) => {
        const active = currentPath === href || currentPath.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
              active
                ? 'bg-brand-soft font-medium text-brand'
                : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export type { MessageKey };

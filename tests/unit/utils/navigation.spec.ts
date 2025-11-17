import { describe, it, expect } from 'vitest';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';

describe('Navigation', () => {
  describe('authenticatedNavItems', () => {
    it('should contain Home nav item', () => {
      const homeItem = authenticatedNavItems.find(
        (item) => item.label === 'Home'
      );
      expect(homeItem).toBeDefined();
      expect(homeItem?.href).toBe('/');
    });

    it('should contain Explore nav item', () => {
      const exploreItem = authenticatedNavItems.find(
        (item) => item.label === 'Explore'
      );
      expect(exploreItem).toBeDefined();
      expect(exploreItem?.href).toBe('/explore');
    });

    it('should contain Integrations nav item', () => {
      const integrationsItem = authenticatedNavItems.find(
        (item) => item.label === 'Integrations'
      );
      expect(integrationsItem).toBeDefined();
      expect(integrationsItem?.href).toBe('/integrations');
    });

    it('should have correct number of nav items', () => {
      expect(authenticatedNavItems.length).toBe(3);
    });

    it('should not have highlight flag on any items', () => {
      const highlightedItems = authenticatedNavItems.filter(
        (item) => item.highlight
      );
      expect(highlightedItems.length).toBe(0);
    });

    it('should not have dropdown on any items', () => {
      const dropdownItems = authenticatedNavItems.filter(
        (item) => item.dropdown
      );
      expect(dropdownItems.length).toBe(0);
    });

    it('should have valid href for all items', () => {
      authenticatedNavItems.forEach((item) => {
        expect(item.href).toBeDefined();
        expect(typeof item.href).toBe('string');
        expect(item.href.length).toBeGreaterThan(0);
      });
    });

    it('should conform to NavItem type', () => {
      authenticatedNavItems.forEach((item) => {
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('href');
        expect(typeof item.label).toBe('string');
        expect(typeof item.href).toBe('string');
      });
    });
  });

  describe('unauthenticatedNavItems', () => {
    it('should contain Home nav item', () => {
      const homeItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Home'
      );
      expect(homeItem).toBeDefined();
      expect(homeItem?.href).toBe('/');
    });

    it('should contain Explore nav item', () => {
      const exploreItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Explore'
      );
      expect(exploreItem).toBeDefined();
      expect(exploreItem?.href).toBe('/explore');
    });

    it('should contain Pricing nav item', () => {
      const pricingItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Pricing'
      );
      expect(pricingItem).toBeDefined();
      expect(pricingItem?.href).toBe('/pricing');
    });

    it('should contain About nav item', () => {
      const aboutItem = unauthenticatedNavItems.find(
        (item) => item.label === 'About'
      );
      expect(aboutItem).toBeDefined();
      expect(aboutItem?.href).toBe('/about');
    });

    it('should have correct number of nav items', () => {
      expect(unauthenticatedNavItems.length).toBe(4);
    });

    it('should not have Integrations nav item', () => {
      const integrationsItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Integrations'
      );
      expect(integrationsItem).toBeUndefined();
    });

    it('should not have highlight flag on any items', () => {
      const highlightedItems = unauthenticatedNavItems.filter(
        (item) => item.highlight
      );
      expect(highlightedItems.length).toBe(0);
    });

    it('should not have dropdown on any items', () => {
      const dropdownItems = unauthenticatedNavItems.filter(
        (item) => item.dropdown
      );
      expect(dropdownItems.length).toBe(0);
    });

    it('should have valid href for all items', () => {
      unauthenticatedNavItems.forEach((item) => {
        expect(item.href).toBeDefined();
        expect(typeof item.href).toBe('string');
        expect(item.href.length).toBeGreaterThan(0);
      });
    });

    it('should conform to NavItem type', () => {
      unauthenticatedNavItems.forEach((item) => {
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('href');
        expect(typeof item.label).toBe('string');
        expect(typeof item.href).toBe('string');
      });
    });
  });

  describe('Navigation differences', () => {
    it('should have different items between authenticated and unauthenticated', () => {
      expect(authenticatedNavItems).not.toEqual(unauthenticatedNavItems);
    });

    it('should share Home and Explore items', () => {
      const authHome = authenticatedNavItems.find(
        (item) => item.label === 'Home'
      );
      const unauthHome = unauthenticatedNavItems.find(
        (item) => item.label === 'Home'
      );
      expect(authHome?.href).toBe(unauthHome?.href);

      const authExplore = authenticatedNavItems.find(
        (item) => item.label === 'Explore'
      );
      const unauthExplore = unauthenticatedNavItems.find(
        (item) => item.label === 'Explore'
      );
      expect(authExplore?.href).toBe(unauthExplore?.href);
    });

    it('should have Integrations only for authenticated users', () => {
      const authIntegrations = authenticatedNavItems.find(
        (item) => item.label === 'Integrations'
      );
      const unauthIntegrations = unauthenticatedNavItems.find(
        (item) => item.label === 'Integrations'
      );
      expect(authIntegrations).toBeDefined();
      expect(unauthIntegrations).toBeUndefined();
    });

    it('should have Pricing and About only for unauthenticated users', () => {
      const authPricing = authenticatedNavItems.find(
        (item) => item.label === 'Pricing'
      );
      const unauthPricing = unauthenticatedNavItems.find(
        (item) => item.label === 'Pricing'
      );
      expect(authPricing).toBeUndefined();
      expect(unauthPricing).toBeDefined();

      const authAbout = authenticatedNavItems.find(
        (item) => item.label === 'About'
      );
      const unauthAbout = unauthenticatedNavItems.find(
        (item) => item.label === 'About'
      );
      expect(authAbout).toBeUndefined();
      expect(unauthAbout).toBeDefined();
    });
  });
});

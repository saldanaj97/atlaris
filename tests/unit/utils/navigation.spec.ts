import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';
import { describe, expect, it } from 'vitest';

describe('Navigation', () => {
  describe('authenticatedNavItems', () => {
    it('should contain Dashboard nav item', () => {
      const dashboardItem = authenticatedNavItems.find(
        (item) => item.label === 'Dashboard'
      );
      expect(dashboardItem).toBeDefined();
      expect(dashboardItem?.href).toBe('/dashboard');
    });

    it('should contain Analytics nav item with dropdown', () => {
      const analyticsItem = authenticatedNavItems.find(
        (item) => item.label === 'Analytics'
      );
      expect(analyticsItem).toBeDefined();
      expect(analyticsItem?.href).toBe('/analytics');
      expect(analyticsItem?.dropdown).toBeDefined();
      expect(analyticsItem?.dropdown?.length).toBe(2);
      expect(analyticsItem?.dropdown?.[0]).toEqual({
        label: 'Usage',
        href: '/analytics/usage',
      });
      expect(analyticsItem?.dropdown?.[1]).toEqual({
        label: 'Achievements',
        href: '/analytics/achievements',
      });
    });

    it('should contain Settings nav item with dropdown', () => {
      const settingsItem = authenticatedNavItems.find(
        (item) => item.label === 'Settings'
      );
      expect(settingsItem).toBeDefined();
      expect(settingsItem?.href).toBe('/settings');
      expect(settingsItem?.dropdown).toBeDefined();
      expect(settingsItem?.dropdown?.length).toBe(4);
      expect(settingsItem?.dropdown).toContainEqual({
        label: 'Profile',
        href: '/settings/profile',
      });
      expect(settingsItem?.dropdown).toContainEqual({
        label: 'Notifications',
        href: '/settings/notifications',
      });
      expect(settingsItem?.dropdown).toContainEqual({
        label: 'Integrations',
        href: '/settings/integrations',
      });
      expect(settingsItem?.dropdown).toContainEqual({
        label: 'Billing',
        href: '/settings/billing',
      });
    });

    it('should contain Plans nav item', () => {
      const plansItem = authenticatedNavItems.find(
        (item) => item.label === 'Plans'
      );
      expect(plansItem).toBeDefined();
      expect(plansItem?.href).toBe('/plans');
    });

    it('should have correct number of nav items', () => {
      expect(authenticatedNavItems.length).toBe(4);
    });

    it('should not have highlight flag on any items', () => {
      const highlightedItems = authenticatedNavItems.filter(
        (item) => item.highlight
      );
      expect(highlightedItems.length).toBe(0);
    });

    it('should have dropdowns on Analytics and Settings items', () => {
      const dropdownItems = authenticatedNavItems.filter(
        (item) => item.dropdown
      );
      expect(dropdownItems.length).toBe(2);
      expect(dropdownItems.map((item) => item.label)).toContain('Analytics');
      expect(dropdownItems.map((item) => item.label)).toContain('Settings');
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

    it('should not have Dashboard, Analytics, or Settings nav items', () => {
      const dashboardItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Dashboard'
      );
      const analyticsItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Analytics'
      );
      const settingsItem = unauthenticatedNavItems.find(
        (item) => item.label === 'Settings'
      );
      expect(dashboardItem).toBeUndefined();
      expect(analyticsItem).toBeUndefined();
      expect(settingsItem).toBeUndefined();
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

    it('should have completely different navigation structure', () => {
      // Authenticated users have Dashboard, Plans, Analytics, Settings
      const authLabels = authenticatedNavItems.map((item) => item.label);
      expect(authLabels).toContain('Dashboard');
      expect(authLabels).toContain('Plans');
      expect(authLabels).toContain('Analytics');
      expect(authLabels).toContain('Settings');

      // Unauthenticated users have Home, Explore, Pricing, About
      const unauthLabels = unauthenticatedNavItems.map((item) => item.label);
      expect(unauthLabels).toContain('Home');
      expect(unauthLabels).toContain('Explore');
      expect(unauthLabels).toContain('Pricing');
      expect(unauthLabels).toContain('About');
    });

    it('should have authenticated-only navigation items', () => {
      const authDashboard = authenticatedNavItems.find(
        (item) => item.label === 'Dashboard'
      );
      const unauthDashboard = unauthenticatedNavItems.find(
        (item) => item.label === 'Dashboard'
      );
      expect(authDashboard).toBeDefined();
      expect(unauthDashboard).toBeUndefined();

      const authAnalytics = authenticatedNavItems.find(
        (item) => item.label === 'Analytics'
      );
      const unauthAnalytics = unauthenticatedNavItems.find(
        (item) => item.label === 'Analytics'
      );
      expect(authAnalytics).toBeDefined();
      expect(unauthAnalytics).toBeUndefined();

      const authSettings = authenticatedNavItems.find(
        (item) => item.label === 'Settings'
      );
      const unauthSettings = unauthenticatedNavItems.find(
        (item) => item.label === 'Settings'
      );
      expect(authSettings).toBeDefined();
      expect(unauthSettings).toBeUndefined();

      const authPlans = authenticatedNavItems.find(
        (item) => item.label === 'Plans'
      );
      const unauthPlans = unauthenticatedNavItems.find(
        (item) => item.label === 'Plans'
      );
      expect(authPlans).toBeDefined();
      expect(unauthPlans).toBeUndefined();
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

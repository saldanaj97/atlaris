'use client';

import type { ReactNode } from 'react';

import { PricingFinalCta } from '@/app/(marketing)/pricing/components/PricingFinalCta';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useState } from 'react';

import styles from './PricingDesignExplorer.module.css';

type DesignId = 'monograph' | 'mission' | 'field' | 'bauhaus' | 'nocturne';

interface DesignOption {
  id: DesignId;
  index: string;
  label: string;
  eyebrow: string;
  titleLead: string;
  titleAccent: string;
  description: string;
  noteLabel: string;
  note: string;
  mark: string;
  tableKicker: string;
  tableTitle: string;
  metaPrimary: string;
  metaSecondary: string;
}

const DESIGN_OPTIONS = [
  {
    id: 'monograph',
    index: '01',
    label: 'Monograph',
    eyebrow: 'Atlaris Editions / Pricing',
    titleLead: 'A learning practice',
    titleAccent: 'with room to grow.',
    description:
      'Choose the plan that fits the chapter you are in. Begin freely, then make space for bigger ambitions when they arrive.',
    noteLabel: "Editor's note",
    note: 'The best plan is the one that keeps attention on the work. Start simply. Expand only when your practice asks for a larger canvas.',
    mark: 'Aa',
    tableKicker: 'Three thoughtful ways in',
    tableTitle: 'Choose your chapter',
    metaPrimary: 'Volume 01 / The Growth Issue',
    metaSecondary: 'No pressure. Just possibility.',
  },
  {
    id: 'mission',
    index: '02',
    label: 'Mission Control',
    eyebrow: 'Mission control // plan deck',
    titleLead: 'Plot a course.',
    titleAccent: 'Keep your momentum.',
    description:
      'Lock in the learning trajectory that matches your current mission. Every route begins at zero and scales when you are ready.',
    noteLabel: 'Flight note 07-A',
    note: 'Capacity is a control, not a commitment. Pick the range you need now and adjust the flight plan as your goals evolve.',
    mark: '◎',
    tableKicker: 'Systems online',
    tableTitle: 'Select trajectory',
    metaPrimary: 'Signal stable / Checkout ready',
    metaSecondary: 'Destination: sustained progress',
  },
  {
    id: 'field',
    index: '03',
    label: 'Field Notes',
    eyebrow: 'Field guide no. 03 / Learning in the wild',
    titleLead: 'Learn in season.',
    titleAccent: 'Grow for the long run.',
    description:
      'Start with the trail in front of you. Choose a plan that feels natural today, knowing there is always more room farther on.',
    noteLabel: 'Trail wisdom',
    note: 'Good growth is rarely rushed. Begin with one clear direction, keep showing up, and widen the path when curiosity outgrows it.',
    mark: '✣',
    tableKicker: 'Pick your trail',
    tableTitle: 'Room for every pace',
    metaPrimary: 'Open terrain / Flexible routes',
    metaSecondary: 'Pack light. Learn deeply.',
  },
  {
    id: 'bauhaus',
    index: '04',
    label: 'Bauhaus',
    eyebrow: 'Form / Function / Forward',
    titleLead: 'More learning.',
    titleAccent: 'Less friction.',
    description:
      'Clear plans. Honest pricing. A direct path from the thing you want to know to the work that helps you know it.',
    noteLabel: 'The principle',
    note: 'A plan should remove decisions, not add them. Choose the shape that fits. Change it when the work changes.',
    mark: '●',
    tableKicker: 'Three forms / One purpose',
    tableTitle: 'Choose the fit',
    metaPrimary: 'Built for focus',
    metaSecondary: 'Nothing ornamental about progress.',
  },
  {
    id: 'nocturne',
    index: '05',
    label: 'After Hours',
    eyebrow: 'The after-hours edition',
    titleLead: 'Make space for',
    titleAccent: 'the work that changes you.',
    description:
      'For the quiet hours, the deep dives, and the subjects you cannot stop thinking about. Begin tonight and grow on your terms.',
    noteLabel: 'A private invitation',
    note: 'Follow the idea that stays with you after the day is done. Your plan can stay intimate or grow into something expansive.',
    mark: '✦',
    tableKicker: 'Your table is waiting',
    tableTitle: 'Reserve your pace',
    metaPrimary: 'Open late / Built for depth',
    metaSecondary: 'A little more room for wonder.',
  },
] as const satisfies readonly DesignOption[];

interface PricingDesignExplorerProps {
  children: ReactNode;
}

export function PricingDesignExplorer({
  children,
}: PricingDesignExplorerProps) {
  const [designId, setDesignId] = useState<DesignId>('monograph');
  const activeDesign =
    DESIGN_OPTIONS.find((design) => design.id === designId) ??
    DESIGN_OPTIONS[0];

  return (
    <Tabs
      value={designId}
      onValueChange={(value) => setDesignId(value as DesignId)}
      className={styles.explorer}
    >
      <div className={styles.switcherDock}>
        <div className={styles.switcher}>
          <div className={styles.switcherHeading} aria-hidden='true'>
            <span>Pricing studio</span>
            <small>5 directions</small>
          </div>
          <div className={styles.switcherScroll}>
            <TabsList
              aria-label='Pricing design options'
              className={styles.switcherList}
            >
              {DESIGN_OPTIONS.map((design) => (
                <TabsTrigger
                  key={design.id}
                  value={design.id}
                  className={styles.switcherTab}
                >
                  <span className={styles.switcherIndex}>{design.index}</span>
                  <span>{design.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
      </div>

      <TabsContent
        value={activeDesign.id}
        className={`${styles.canvas} ${styles[activeDesign.id]}`}
      >
        <div className={styles.texture} aria-hidden='true' />
        <div className={styles.ambient} aria-hidden='true'>
          <span />
          <span />
          <span />
        </div>

        <div className={styles.inner}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>
              <span>{activeDesign.index}</span>
              {activeDesign.eyebrow}
            </p>
            <h1 className={styles.title}>
              <span>{activeDesign.titleLead}</span>{' '}
              <em>{activeDesign.titleAccent}</em>
            </h1>
            <p className={styles.description}>{activeDesign.description}</p>
            <div className={styles.heroMeta}>
              <span>{activeDesign.metaPrimary}</span>
              <span>{activeDesign.metaSecondary}</span>
            </div>
          </header>

          <aside
            className={styles.annotation}
            aria-label={`${activeDesign.label} concept note`}
          >
            <span className={styles.annotationMark} aria-hidden='true'>
              {activeDesign.mark}
            </span>
            <p className={styles.annotationLabel}>{activeDesign.noteLabel}</p>
            <p className={styles.annotationCopy}>{activeDesign.note}</p>
          </aside>

          <section
            className={styles.pricingSection}
            aria-labelledby='pricing-options-heading'
          >
            <div className={styles.sectionHeading}>
              <div>
                <p>{activeDesign.tableKicker}</p>
                <h2 id='pricing-options-heading'>{activeDesign.tableTitle}</h2>
              </div>
              <span aria-hidden='true'>01 — 03</span>
            </div>
            <div className={styles.pricingMount}>{children}</div>
          </section>

          <div className={styles.finalCta}>
            <PricingFinalCta />
          </div>

          <footer className={styles.conceptFooter}>
            <span>
              {activeDesign.index} / {activeDesign.label}
            </span>
            <span>Use the arrow keys to compare directions</span>
          </footer>
        </div>
      </TabsContent>
    </Tabs>
  );
}

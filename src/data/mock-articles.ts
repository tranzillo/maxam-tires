/**
 * Mock article/resource data for development.
 * Covers all 5 article types across multiple industries.
 * Will be replaced by Notion API fetches once the CMS is set up.
 */
import type { Article } from '../types';
import { industries } from './mock-tires';

export const articles: Article[] = [
  {
    id: 'art-1',
    slug: 'maxam-launches-ms402-ultra-class',
    title: 'MAXAM Launches MS402 for Ultra-Class Haul Trucks',
    excerpt: 'MAXAM introduces the MS402, a new all-steel radial tire engineered for the largest rigid dump trucks in mining operations worldwide.',
    content: '<p>MAXAM introduces the MS402, engineered for ultra-class haul trucks...</p>',
    type: 'news',
    date: '2026-03-10',
    industries: [industries[0], industries[1]], // Mining, OTR
  },
  {
    id: 'art-2',
    slug: 'choosing-the-right-tire-for-your-skid-steer',
    title: 'Choosing the Right Tire for Your Skid Steer',
    excerpt: 'A comprehensive guide to selecting between pneumatic and solid skid steer tires for construction applications.',
    content: '<p>When it comes to skid steer tires, the choice between pneumatic and solid...</p>',
    type: 'blog',
    date: '2026-02-28',
    industries: [industries[2]], // Construction
  },
  {
    id: 'art-3',
    slug: 'maxam-at-conexpo-2026',
    title: 'MAXAM at CONEXPO-CON/AGG 2026',
    excerpt: 'Visit MAXAM at booth #12345 to see our full lineup of construction and OTR tires, including live product demonstrations.',
    content: '<p>MAXAM will be exhibiting at CONEXPO-CON/AGG 2026...</p>',
    type: 'event',
    date: '2026-03-15',
    industries: [industries[2], industries[1]], // Construction, OTR
  },
  {
    id: 'art-4',
    slug: 'ms705-product-sheet',
    title: 'MS705 Construction Pro — Product Sheet',
    excerpt: 'Technical specifications, sizing chart, and performance data for the MS705 solid skid steer tire.',
    content: '',
    type: 'product-sheet',
    date: '2025-11-01',
    fileUrl: '/documents/ms705-product-sheet.pdf',
    industries: [industries[2]], // Construction
  },
  {
    id: 'art-5',
    slug: 'maxam-agriculture-brochure-2026',
    title: 'MAXAM Agriculture Product Catalog 2026',
    excerpt: 'Complete catalog of MAXAM agricultural tires including the AGRIXTRA and AGILXTRA product lines.',
    content: '',
    type: 'brochure',
    date: '2026-01-15',
    fileUrl: '/documents/maxam-ag-catalog-2026.pdf',
    industries: [industries[3]], // Agricultural
  },
  {
    id: 'art-6',
    slug: 'reducing-soil-compaction-with-vf-tires',
    title: 'Reducing Soil Compaction with VF Technology Tires',
    excerpt: 'How Very High Flexion (VF) tires help modern farming operations minimize soil compaction while maintaining productivity.',
    content: '<p>Soil compaction is one of the biggest challenges facing modern agriculture...</p>',
    type: 'blog',
    date: '2026-01-20',
    industries: [industries[3]], // Agricultural
  },
  {
    id: 'art-7',
    slug: 'maxam-expands-mining-tire-lineup',
    title: 'MAXAM Expands Mining Tire Lineup with New Sizes',
    excerpt: 'New size additions to the MS401 and MS402 product lines give mining operators more options for fleet standardization.',
    content: '<p>MAXAM has expanded its mining tire portfolio...</p>',
    type: 'news',
    date: '2026-02-01',
    industries: [industries[0]], // Mining
  },
  {
    id: 'art-8',
    slug: 'forestry-tire-maintenance-guide',
    title: 'Forestry Tire Maintenance: Maximizing Service Life',
    excerpt: 'Best practices for inspecting, maintaining, and extending the life of forestry tires in demanding logging operations.',
    content: '<p>Forestry tires operate in some of the harshest environments...</p>',
    type: 'blog',
    date: '2025-12-15',
    industries: [industries[4]], // Forestry
  },
  {
    id: 'art-9',
    slug: 'ms401-product-sheet',
    title: 'MS401 E4 — Product Sheet',
    excerpt: 'Technical specifications and TKPH ratings for the MS401 mining haul truck tire.',
    content: '',
    type: 'product-sheet',
    date: '2025-10-01',
    fileUrl: '/documents/ms401-product-sheet.pdf',
    industries: [industries[0], industries[1]], // Mining, OTR
  },
  {
    id: 'art-10',
    slug: 'maxam-rubber-tracks-launch',
    title: 'MAXAM Enters Rubber Track Market with MT Series',
    excerpt: 'MAXAM launches the MT130 and MT150 rubber tracks for compact track loaders, expanding beyond tires for the first time.',
    content: '<p>MAXAM has officially entered the rubber track market...</p>',
    type: 'news',
    date: '2026-03-01',
    industries: [industries[5]], // Rubber Tracks
  },
  {
    id: 'art-11',
    slug: 'underground-mining-tire-selection',
    title: 'Selecting Tires for Underground Mining Equipment',
    excerpt: 'Key factors to consider when choosing tires for underground mining articulated dump trucks and loaders.',
    content: '<p>Underground mining presents unique challenges for tire selection...</p>',
    type: 'blog',
    date: '2026-02-10',
    industries: [industries[7]], // Underground Mining
  },
  {
    id: 'art-12',
    slug: 'maxam-otr-brochure',
    title: 'MAXAM OTR Tire Solutions Brochure',
    excerpt: 'Overview of MAXAM off-the-road tire solutions for mining, construction, and industrial applications.',
    content: '',
    type: 'brochure',
    date: '2025-09-01',
    fileUrl: '/documents/maxam-otr-brochure.pdf',
    industries: [industries[1]], // OTR
  },
];

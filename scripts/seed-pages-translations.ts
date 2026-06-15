/**
 * Seed translated homepage (Pages + Page Promos) content for the languages
 * added 2026-06-13 (de, es, fr, it, ja, pt-pt, ru) into Notion.
 *
 * Why hand-authored: the WP homepage content lives in freeform Gutenberg
 * post_content, not clean ACF fields, and the per-language versions aren't
 * cleanly parseable — so (like the original en/ar-ae/zh-hant seed) the home
 * copy is translated here and imported through the normal Pages pipeline.
 *
 * Idempotent: skips any (slug + language) already present in the Pages DB and
 * any (trid + language) already present in the Page Promos DB. Safe to re-run.
 *
 * After running, link siblings:
 *   npx tsx scripts/link-notion-siblings.ts pages
 *   npx tsx scripts/link-notion-siblings.ts page-promos
 *
 * Usage: npx tsx scripts/seed-pages-translations.ts [langs...] [--dry-run]
 */
import { notion } from './notion-client.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');
const IDS_FILE = join(OUT, 'notion-ids.json');

// Non-translatable keys carried verbatim from the English seed.
const SHARED = {
  'hero.background_image': '/images/hero-home.jpg',
  'hero.background_position': 'center',
  'hero.cta_href': '/products',
  'sustainability.cta_href': '/sustainability',
  'sustainability.background_image': '/images/bg-sustainability.jpg',
  'newsletter.background_image': '/images/bg-newsletter.jpg',
};

// trids reuse the existing home page group (100001) and promo groups
// (100101 = Find Your Grip, 100102 = Rubber Tracks) so new-language rows link
// to the existing en/ar-ae/zh-hant siblings.
const HOME_TRID = 100001;
const PROMO_FYG_TRID = 100101;
const PROMO_RT_TRID = 100102;

interface LangContent {
  title: string;
  hero: { lead: string; heading: string; description: string; cta_label: string };
  sustainability: { heading: string; lead: string; body: string; cta_label: string };
  newsletter: { heading: string; description: string; email_label: string; submit_label: string };
  promoFyg: { heading: string; description: string; ctaLabel: string };
  promoRt: { tag: string; heading: string; description: string; ctaLabel: string };
}

const CONTENT: Record<string, LangContent> = {
  de: {
    title: 'Startseite',
    hero: { lead: 'Bringen Sie den', heading: 'Job zu Ende', description: 'Mit zuverlässiger Reifenqualität, Leistung und unübertroffenem Kundenservice bringen wir Sie dazu, selbst die schwierigsten Aufgaben zu meistern.', cta_label: 'Warum Maxam?' },
    sustainability: { heading: 'Nachhaltige Reifenentwicklung', lead: 'Erfahren Sie, wie wir die Leistung und Haltbarkeit der Mischungstechnologie revolutionieren – mit maximaler Reifenlebensdauer, unübertroffener Leistung und evolutionärer Mischung.', body: 'Die EcoPoint<sup>3</sup>-Technologie ist ein Durchbruch in der grünen und kohlenstoffarmen Reifenentwicklung – von der Auswahl der Rohstoffe über die Herstellung bis hin zum Produktlebenszyklus – und reduziert gleichzeitig den Kraftstoffverbrauch und die CO₂-Emissionen erheblich.', cta_label: 'Mehr erfahren' },
    newsletter: { heading: 'Werden Sie Teil unseres Netzwerks', description: 'Abonnieren Sie unseren Newsletter und erhalten Sie die neuesten Nachrichten, Produktangebote und exklusive Inhalte direkt in Ihr Postfach.', email_label: 'E-Mail-Adresse', submit_label: 'Abonnieren' },
    promoFyg: { heading: 'Finden Sie Ihren Grip', description: 'Profitieren Sie von der modernsten Traktionstechnologie zum besten Preis.', ctaLabel: 'Produkte entdecken' },
    promoRt: { tag: 'Neu', heading: 'Gummiketten', description: 'Rüsten Sie Ihre Baumaschinen mit den Gummiketten von MAXAM auf.', ctaLabel: 'Gummiketten entdecken' },
  },
  es: {
    title: 'Inicio',
    hero: { lead: 'Haga el', heading: 'Trabajo', description: 'Con una calidad de neumáticos fiable, alto rendimiento y un servicio al cliente inigualable, le impulsamos a completar incluso los trabajos más exigentes.', cta_label: '¿Por qué Maxam?' },
    sustainability: { heading: 'Desarrollo sostenible de neumáticos', lead: 'Descubra cómo estamos revolucionando el rendimiento y la durabilidad de la tecnología de compuestos, con la máxima vida útil del neumático, un rendimiento inigualable y una mezcla evolutiva.', body: 'La tecnología EcoPoint<sup>3</sup> es un avance en el desarrollo de neumáticos ecológicos y de bajas emisiones de carbono, desde la selección de materias primas y la fabricación hasta el ciclo de vida del producto, reduciendo significativamente el consumo de combustible y las emisiones de carbono.', cta_label: 'Más información' },
    newsletter: { heading: 'Únase a nuestra red', description: 'Suscríbase a nuestro boletín para recibir las últimas noticias, ofertas de productos y contenido exclusivo directamente en su bandeja de entrada.', email_label: 'Correo electrónico', submit_label: 'Suscribirse' },
    promoFyg: { heading: 'Encuentre su agarre', description: 'Aproveche la tecnología de tracción más avanzada al mejor precio.', ctaLabel: 'Explorar productos' },
    promoRt: { tag: 'Novedad', heading: 'Orugas de caucho', description: 'Mejore su equipo de construcción con las orugas de caucho de MAXAM.', ctaLabel: 'Explorar orugas de caucho' },
  },
  fr: {
    title: 'Accueil',
    hero: { lead: 'Menez le', heading: 'Travail à bien', description: 'Grâce à une qualité de pneus fiable, des performances élevées et un service client inégalé, nous vous aidons à accomplir même les tâches les plus difficiles.', cta_label: 'Pourquoi Maxam ?' },
    sustainability: { heading: 'Développement durable des pneus', lead: 'Découvrez comment nous révolutionnons les performances et la durabilité de la technologie de mélange, avec une durée de vie maximale des pneus, des performances inégalées et un mélange évolutif.', body: 'La technologie EcoPoint<sup>3</sup> est une avancée majeure dans le développement de pneus écologiques et à faible émission de carbone, de la sélection des matières premières à la fabrication et au cycle de vie du produit, tout en réduisant considérablement la consommation de carburant et les émissions de carbone.', cta_label: 'En savoir plus' },
    newsletter: { heading: 'Rejoignez notre réseau', description: 'Abonnez-vous à notre newsletter pour recevoir les dernières actualités, offres de produits et contenus exclusifs directement dans votre boîte de réception.', email_label: 'Adresse e-mail', submit_label: 'S’abonner' },
    promoFyg: { heading: 'Trouvez votre adhérence', description: 'Profitez de la technologie de traction la plus avancée au meilleur prix.', ctaLabel: 'Découvrir les produits' },
    promoRt: { tag: 'Nouveauté', heading: 'Chenilles en caoutchouc', description: 'Améliorez vos engins de chantier avec les chenilles en caoutchouc de MAXAM.', ctaLabel: 'Découvrir les chenilles' },
  },
  it: {
    title: 'Home',
    hero: { lead: 'Porta a termine', heading: 'Il lavoro', description: 'Con una qualità degli pneumatici affidabile, prestazioni elevate e un servizio clienti impareggiabile, ti aiutiamo a portare a termine anche i lavori più impegnativi.', cta_label: 'Perché Maxam?' },
    sustainability: { heading: 'Sviluppo sostenibile degli pneumatici', lead: 'Scopri come stiamo rivoluzionando le prestazioni e la durata della tecnologia di mescola, con la massima durata degli pneumatici, prestazioni impareggiabili e una mescola evolutiva.', body: 'La tecnologia EcoPoint<sup>3</sup> è una svolta nello sviluppo di pneumatici ecologici e a basse emissioni di carbonio, dalla selezione delle materie prime alla produzione e al ciclo di vita del prodotto, riducendo significativamente il consumo di carburante e le emissioni di carbonio.', cta_label: 'Scopri di più' },
    newsletter: { heading: 'Entra nella nostra rete', description: 'Iscriviti alla nostra newsletter per ricevere le ultime notizie, le offerte sui prodotti e contenuti esclusivi direttamente nella tua casella di posta.', email_label: 'Indirizzo e-mail', submit_label: 'Iscriviti' },
    promoFyg: { heading: 'Trova la tua aderenza', description: 'Approfitta della tecnologia di trazione più avanzata al miglior prezzo.', ctaLabel: 'Esplora i prodotti' },
    promoRt: { tag: 'Novità', heading: 'Cingoli in gomma', description: 'Aggiorna le tue attrezzature da costruzione con i cingoli in gomma MAXAM.', ctaLabel: 'Esplora i cingoli in gomma' },
  },
  ja: {
    title: 'ホーム',
    hero: { lead: '仕事を', heading: 'やり遂げる', description: '信頼性の高いタイヤ品質、性能、そして比類なきカスタマーサービスにより、最も過酷な作業の完遂を後押しします。', cta_label: 'MAXAMが選ばれる理由' },
    sustainability: { heading: '持続可能なタイヤ開発', lead: '最大のタイヤ寿命、比類なき性能、進化する配合技術により、配合技術の性能と耐久性をどのように革新しているかをご覧ください。', body: 'EcoPoint<sup>3</sup>テクノロジーは、原材料の選定から製造、製品ライフサイクルに至るまで、環境に優しい低炭素タイヤ開発における画期的な進歩であり、燃料消費と炭素排出を大幅に削減します。', cta_label: '詳細を見る' },
    newsletter: { heading: 'ネットワークに参加', description: 'ニュースレターを購読して、最新ニュース、製品情報、限定コンテンツを受信トレイで直接お受け取りください。', email_label: 'メールアドレス', submit_label: '購読する' },
    promoFyg: { heading: '最適なグリップを', description: '最先端のトラクション技術を、最高のコストパフォーマンスでご利用いただけます。', ctaLabel: '製品を見る' },
    promoRt: { tag: '新登場', heading: 'ゴムクローラー', description: 'MAXAMのゴムクローラーで建設機械をアップグレード。', ctaLabel: 'ゴムクローラーを見る' },
  },
  'pt-pt': {
    title: 'Início',
    hero: { lead: 'Conclua o', heading: 'Trabalho', description: 'Com qualidade de pneus fiável, desempenho elevado e um serviço ao cliente incomparável, ajudamo-lo a concluir até os trabalhos mais exigentes.', cta_label: 'Porquê a Maxam?' },
    sustainability: { heading: 'Desenvolvimento sustentável de pneus', lead: 'Saiba como estamos a revolucionar o desempenho e a durabilidade da tecnologia de composição, com a máxima vida útil do pneu, desempenho incomparável e composição evolutiva.', body: 'A tecnologia EcoPoint<sup>3</sup> é um avanço no desenvolvimento de pneus ecológicos e de baixo carbono, desde a seleção de matérias-primas e fabrico até ao ciclo de vida do produto, reduzindo significativamente o consumo de combustível e as emissões de carbono.', cta_label: 'Saber mais' },
    newsletter: { heading: 'Junte-se à nossa rede', description: 'Subscreva a nossa newsletter para receber as últimas notícias, ofertas de produtos e conteúdo exclusivo diretamente na sua caixa de entrada.', email_label: 'Endereço de e-mail', submit_label: 'Subscrever' },
    promoFyg: { heading: 'Encontre a sua aderência', description: 'Aproveite a tecnologia de tração mais avançada ao melhor preço.', ctaLabel: 'Explorar produtos' },
    promoRt: { tag: 'Novidade', heading: 'Lagartas de borracha', description: 'Melhore o seu equipamento de construção com as lagartas de borracha da MAXAM.', ctaLabel: 'Explorar lagartas de borracha' },
  },
  ru: {
    title: 'Главная',
    hero: { lead: 'Выполните', heading: 'Работу', description: 'Благодаря надёжному качеству шин, высокой производительности и непревзойдённому сервису мы помогаем вам справляться даже с самыми сложными задачами.', cta_label: 'Почему Maxam?' },
    sustainability: { heading: 'Экологичная разработка шин', lead: 'Узнайте, как мы революционизируем производительность и долговечность технологии компаундирования, обеспечивая максимальный срок службы шин, непревзойдённые характеристики и эволюционные смеси.', body: 'Технология EcoPoint<sup>3</sup> — это прорыв в разработке экологичных и низкоуглеродных шин, от выбора сырья и производства до жизненного цикла продукта, при значительном снижении расхода топлива и выбросов углерода.', cta_label: 'Подробнее' },
    newsletter: { heading: 'Присоединяйтесь к нашей сети', description: 'Подпишитесь на нашу рассылку, чтобы получать последние новости, предложения о продуктах и эксклюзивный контент прямо на вашу почту.', email_label: 'Адрес электронной почты', submit_label: 'Подписаться' },
    promoFyg: { heading: 'Найдите своё сцепление', description: 'Воспользуйтесь самой передовой технологией сцепления по лучшей цене.', ctaLabel: 'Смотреть продукцию' },
    promoRt: { tag: 'Новинка', heading: 'Резиновые гусеницы', description: 'Модернизируйте свою строительную технику с резиновыми гусеницами MAXAM.', ctaLabel: 'Смотреть резиновые гусеницы' },
  },
};

function rt(text: string) {
  return text ? [{ type: 'text' as const, text: { content: text.slice(0, 1900) } }] : [];
}

function buildPageProps(lang: string, c: LangContent) {
  const content: Record<string, string> = {
    ...SHARED,
    'hero.lead': c.hero.lead,
    'hero.heading': c.hero.heading,
    'hero.description': c.hero.description,
    'hero.cta_label': c.hero.cta_label,
    'sustainability.heading': c.sustainability.heading,
    'sustainability.lead': c.sustainability.lead,
    'sustainability.body': c.sustainability.body,
    'sustainability.cta_label': c.sustainability.cta_label,
    'newsletter.heading': c.newsletter.heading,
    'newsletter.description': c.newsletter.description,
    'newsletter.email_label': c.newsletter.email_label,
    'newsletter.submit_label': c.newsletter.submit_label,
  };
  const props: any = {
    Name: { title: rt(c.title) },
    Slug: { rich_text: rt('home') },
    Language: { select: { name: lang } },
    'Translation Group': { number: HOME_TRID },
  };
  for (const [k, v] of Object.entries(content)) props[k] = { rich_text: rt(v) };
  return props;
}

function buildPromoProps(lang: string, trid: number, order: number, p: { tag?: string; heading: string; description: string; ctaLabel: string; ctaHref: string; image: string; imagePosition: string }, pageNotionId: string) {
  const props: any = {
    Name: { title: rt(`${p.heading} (${lang})`) },
    Slug: { rich_text: rt(`promo-${trid}-${lang}`) },
    Language: { select: { name: lang } },
    'Translation Group': { number: trid },
    Order: { number: order },
    Heading: { rich_text: rt(p.heading) },
    Description: { rich_text: rt(p.description) },
    'CTA Label': { rich_text: rt(p.ctaLabel) },
    'CTA Href': { rich_text: rt(p.ctaHref) },
    'Image Position': { rich_text: rt(p.imagePosition) },
    Page: { relation: [{ id: pageNotionId }] },
  };
  if (p.tag) props.Tag = { rich_text: rt(p.tag) };
  if (p.image) props.Image = { url: p.image };
  return props;
}

async function existingPageKeys(dsId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({ data_source_id: dsId, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      const slug = pg.properties?.Slug?.rich_text?.[0]?.plain_text;
      const lang = pg.properties?.Language?.select?.name;
      if (slug && lang) keys.add(`${slug}::${lang}`);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return keys;
}

async function existingPromoKeys(dsId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({ data_source_id: dsId, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      const trid = pg.properties?.['Translation Group']?.number;
      const lang = pg.properties?.Language?.select?.name;
      if (trid != null && lang) keys.add(`${trid}::${lang}`);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return keys;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const requested = args.filter((a) => !a.startsWith('--'));
  const langs = (requested.length ? requested : Object.keys(CONTENT)).filter((l) => CONTENT[l]);

  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const pagesDs = ids.pagesDataSourceId;
  const promosDs = ids.pagePromosDataSourceId;
  if (!pagesDs || !promosDs) throw new Error('pages/promos data source IDs missing');

  const havePages = dryRun ? new Set<string>() : await existingPageKeys(pagesDs);
  const havePromos = dryRun ? new Set<string>() : await existingPromoKeys(promosDs);

  // Maps for sibling linking (merge into existing).
  const pagesMapPath = join(OUT, 'notion-pages-map.json');
  const promosMapPath = join(OUT, 'notion-page-promos-map.json');
  const pagesMap: Record<string, Record<string, string>> = existsSync(pagesMapPath) ? JSON.parse(readFileSync(pagesMapPath, 'utf8')) : {};
  const promosMap: Record<string, Record<string, string>> = existsSync(promosMapPath) ? JSON.parse(readFileSync(promosMapPath, 'utf8')) : {};

  for (const lang of langs) {
    const c = CONTENT[lang];
    if (havePages.has(`home::${lang}`)) { console.log(`skip page home/${lang} (exists)`); continue; }
    if (dryRun) { console.log(`[dry-run] page home/${lang} + 2 promos`); continue; }

    const page: any = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: pagesDs } as any,
      properties: buildPageProps(lang, c),
    });
    pagesMap[String(HOME_TRID)] = pagesMap[String(HOME_TRID)] || {};
    pagesMap[String(HOME_TRID)][lang] = page.id;
    console.log(`✓ page home/${lang}`);
    await new Promise((r) => setTimeout(r, 350));

    const promos = [
      { trid: PROMO_FYG_TRID, order: 1, tag: undefined, ...c.promoFyg, ctaHref: '/products', image: '/images/promo-find-your-grip.png', imagePosition: 'center' },
      { trid: PROMO_RT_TRID, order: 2, ...c.promoRt, ctaHref: '/products/rubber-tracks', image: '/images/promo-rubber-tracks.jpg', imagePosition: 'center bottom' },
    ];
    for (const pr of promos) {
      if (havePromos.has(`${pr.trid}::${lang}`)) { console.log(`  skip promo ${pr.trid}/${lang}`); continue; }
      const created: any = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: promosDs } as any,
        properties: buildPromoProps(lang, pr.trid, pr.order, pr, page.id),
      });
      promosMap[String(pr.trid)] = promosMap[String(pr.trid)] || {};
      promosMap[String(pr.trid)][lang] = created.id;
      console.log(`  ✓ promo "${pr.heading}" (${lang})`);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  if (!dryRun) {
    writeFileSync(pagesMapPath, JSON.stringify(pagesMap, null, 2));
    writeFileSync(promosMapPath, JSON.stringify(promosMap, null, 2));
    console.log('\n✓ Merged page + promo translation maps. Next: link siblings (pages, page-promos).');
  }
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });

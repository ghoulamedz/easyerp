// Direct in-process reproduction: boot AppModule the way main.ts does, call setup.complete, print the real error
process.env.DATABASE_URL ??= 'postgresql://easyerp:easyerp@localhost:55432/easyerp?schema=public';
const { NestFactory } = await import('@nestjs/core');
const { ExpressAdapter } = await import('@nestjs/platform-express');
const express = (await import('express')).default;
const { AppModule } = await import('/home/medo/Projects/easyerp/apps/api/dist/app.module.js');
const { DomainExceptionFilter } = await import('/home/medo/Projects/easyerp/apps/api/dist/common/domain-exception.filter.js');
const server = express();
const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { logger: false, bodyParser: false });
app.use(express.json({ limit: '1mb' }));
app.useGlobalFilters(new DomainExceptionFilter());
app.setGlobalPrefix('api');
await app.init();
const svc = app.get('SetupService');
try {
  const r = await svc.complete({ token: 'dev-first-setup-token', business: { legalName: 'T', displayName: 'T', taxIdentifier: '1', countryCode: 'TN', vatRegime: 'EXEMPT', currency: 'TND' }, administrator: { email: 't@t.com', name: 'T', password: 'password1234' }, units: [{ code: 'PCS', allowsFraction: false }], taxRates: [] }, '127.0.0.1');
  console.log('OK', JSON.stringify(r));
} catch (e) { console.error('REAL ERROR:', e?.constructor?.name, '|', e?.message); console.error((e?.stack || '').split('\n').slice(0, 12).join('\n')); }
await app.close();

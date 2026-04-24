#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs/promises';
import path from 'node:path';
import { enrich } from '../index.js';
import { Waterfall } from '../waterfall/index.js';
import { buildProviders, credentialsFromEnv } from '../waterfall/builder.js';
import { FileCache, MemoryCache } from '../cache/index.js';
import type { EnrichmentInput, EnrichmentResult } from '../types.js';

const program = new Command();

program
  .name('enrichment-kit')
  .description('Open-source Clay.com alternative — multi-vendor enrichment waterfalls, BYOK')
  .version('0.1.0');

program
  .command('enrich')
  .description('Enrich a single contact')
  .option('--email <email>', 'email address')
  .option('--name <fullName>', 'full name')
  .option('--company <company>', 'company name')
  .option('--domain <domain>', 'company domain')
  .option('--linkedin <url>', 'LinkedIn URL')
  .option('--no-cache', 'disable cache')
  .option('--json', 'output raw JSON')
  .action(async (opts) => {
    const input: EnrichmentInput = {
      email: opts.email,
      fullName: opts.name,
      company: opts.company,
      domain: opts.domain,
      linkedinUrl: opts.linkedin,
    };

    const spinner = ora('Running waterfall…').start();
    try {
      const creds = credentialsFromEnv();
      const providers = buildProviders(creds);
      if (providers.length === 0) {
        spinner.fail('No providers configured.');
        console.error(chalk.yellow('\nSet at least one of these env vars:'));
        console.error('  HUNTER_API_KEY, APOLLO_API_KEY, SERPAPI_API_KEY + GROQ_API_KEY,');
        console.error('  ANYMAILFINDER_API_KEY, PROXYCURL_API_KEY');
        console.error('\nSee README for how to obtain free-tier API keys.');
        process.exit(2);
      }

      const waterfall = new Waterfall({
        providers,
        cache: opts.cache ? new FileCache() : new MemoryCache(),
        onAttempt: ({ provider, hit, latencyMs, cost }) => {
          spinner.text = `${provider}: ${hit ? chalk.green('hit') : chalk.gray('miss')} (${latencyMs}ms, $${cost.toFixed(4)})`;
        },
      });

      const result = await waterfall.enrich(input);
      spinner.stop();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printResult(result);
    } catch (error) {
      spinner.fail((error as Error).message);
      process.exit(1);
    }
  });

program
  .command('batch <csvFile>')
  .description('Enrich a CSV file of contacts')
  .option('--concurrency <n>', 'parallel enrichments', '3')
  .option('-o, --output <path>', 'output CSV path', 'enriched.csv')
  .action(async (csvFile, opts) => {
    const raw = await fs.readFile(path.resolve(csvFile), 'utf8');
    const { header, rows } = parseCsv(raw);
    console.log(chalk.cyan(`Loaded ${rows.length} contacts from ${csvFile}`));

    const creds = credentialsFromEnv();
    const providers = buildProviders(creds);
    if (providers.length === 0) {
      console.error(chalk.red('No providers configured.'));
      process.exit(2);
    }

    const waterfall = new Waterfall({ providers, cache: new FileCache() });
    const inputs: EnrichmentInput[] = rows.map(row => rowToInput(header, row));

    const spinner = ora(`Enriching ${inputs.length} contacts…`).start();
    let done = 0;
    const results: EnrichmentResult[] = new Array(inputs.length);
    const concurrency = Math.max(1, parseInt(opts.concurrency, 10));
    let cursor = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < inputs.length) {
          const i = cursor++;
          results[i] = await waterfall.enrich(inputs[i]);
          done++;
          spinner.text = `Enriched ${done}/${inputs.length}`;
        }
      })
    );
    spinner.succeed(`Done. ${results.filter(r => r.success).length}/${inputs.length} enriched.`);

    const outputCsv = resultsToCsv(header, rows, results);
    await fs.writeFile(path.resolve(opts.output), outputCsv, 'utf8');
    console.log(chalk.green(`Wrote ${opts.output}`));
    const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
    console.log(chalk.cyan(`Total cost: $${totalCost.toFixed(4)}`));
    console.log(chalk.cyan(`Avg per enriched: $${(totalCost / Math.max(1, results.filter(r => r.success).length)).toFixed(4)}`));
  });

program
  .command('providers')
  .description('List detected providers and their configuration')
  .action(() => {
    const creds = credentialsFromEnv();
    const providers = buildProviders(creds);
    if (providers.length === 0) {
      console.log(chalk.yellow('No providers configured. See README for API key setup.'));
      return;
    }
    console.log(chalk.bold('\nConfigured providers (ordered by effective cost):\n'));
    const sorted = [...providers].sort((a, b) => a.costPerCall / a.typicalHitRate - b.costPerCall / b.typicalHitRate);
    for (const p of sorted) {
      const effective = (p.costPerCall / p.typicalHitRate).toFixed(4);
      console.log(`  ${chalk.green('•')} ${chalk.bold(p.name)}`);
      console.log(`    cost/call: $${p.costPerCall.toFixed(4)} | hit rate: ${(p.typicalHitRate * 100).toFixed(0)}% | effective: $${effective}`);
      console.log(`    capabilities: ${p.capabilities.join(', ')}`);
    }
  });

function printResult(result: EnrichmentResult): void {
  console.log();
  if (!result.success || !result.data) {
    console.log(chalk.red('✗ No enrichment found'));
    console.log(chalk.gray(`  Tried ${result.attempts.length} providers, $${result.totalCost.toFixed(4)} spent, ${result.totalLatencyMs}ms`));
    for (const a of result.attempts) {
      const status = a.hit ? chalk.green('hit') : a.error ? chalk.red('err') : chalk.gray('miss');
      console.log(`  ${status} ${a.provider} (${a.latencyMs}ms)${a.error ? `: ${a.error}` : ''}`);
    }
    return;
  }
  const d = result.data;
  console.log(chalk.green('✓ Enriched') + (result.fromCache ? chalk.gray(' (from cache)') : ''));
  console.log();
  const rows = [
    ['Name', d.fullName],
    ['Title', d.title],
    ['Company', d.company],
    ['Email', d.email + (d.emailVerified ? chalk.green(' (verified)') : '')],
    ['LinkedIn', d.linkedinUrl],
    ['Phone', d.phone],
    ['Location', d.location],
    ['Confidence', `${(d.confidence * 100).toFixed(0)}%`],
    ['Source', d.source],
  ];
  for (const [k, v] of rows) {
    if (v) console.log(`  ${chalk.cyan(k.padEnd(12))} ${v}`);
  }
  console.log();
  console.log(chalk.gray(`  Cost: $${result.totalCost.toFixed(4)} | ${result.totalLatencyMs}ms | ${result.attempts.length} provider(s) tried`));
}

function parseCsv(raw: string): { header: string[]; rows: string[][] } {
  const lines = raw.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { current += '"'; i++; continue; }
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += char;
  }
  result.push(current);
  return result.map(s => s.trim());
}

function rowToInput(header: string[], row: string[]): EnrichmentInput {
  const get = (name: string): string | undefined => {
    const idx = header.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, '') === name.toLowerCase().replace(/[^a-z]/g, ''));
    return idx >= 0 ? row[idx] || undefined : undefined;
  };
  return {
    email: get('email'),
    firstName: get('firstname') ?? get('first'),
    lastName: get('lastname') ?? get('last'),
    fullName: get('fullname') ?? get('name'),
    company: get('company') ?? get('organization'),
    domain: get('domain') ?? get('website'),
    linkedinUrl: get('linkedin') ?? get('linkedinurl'),
  };
}

function resultsToCsv(header: string[], rows: string[][], results: EnrichmentResult[]): string {
  const extraCols = ['enriched_email', 'enriched_linkedin', 'enriched_title', 'enriched_phone', 'enriched_confidence', 'enriched_source', 'enrichment_cost'];
  const out: string[] = [[...header, ...extraCols].map(csvEscape).join(',')];
  for (let i = 0; i < rows.length; i++) {
    const d = results[i]?.data;
    const extra = [
      d?.email ?? '',
      d?.linkedinUrl ?? '',
      d?.title ?? '',
      d?.phone ?? '',
      d?.confidence?.toFixed(2) ?? '',
      d?.source ?? '',
      results[i]?.totalCost.toFixed(4) ?? '',
    ];
    out.push([...rows[i], ...extra].map(csvEscape).join(','));
  }
  return out.join('\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

program.parseAsync().catch(err => {
  console.error(chalk.red(err.message));
  process.exit(1);
});

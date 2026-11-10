# Valuation Toolkit

An investment-banking style valuation package for any US public company, built directly on SEC filings.
Type a ticker and get a company snapshot, an equity-to-enterprise-value bridge, five years of financials
plus LTM, and automatic data-quality tie-outs, with every number linked to its source.

Built by Joaquin Boutsen (Master's in Finance, University of Tampa). I directed the design and chose the
methods; the code was written with an AI coding agent.

## Status

| Module | Status |
| --- | --- |
| Ticker search, company snapshot, EV bridge | Live (Phase 1) |
| Data-quality checks | Live (Phase 1) |
| Trading comps, DCF | Phase 2 |
| Football field, merger model | Phase 3 |
| Excel export, interview prep notes | Phase 4 |

## Data sources

- **Financial statements:** SEC EDGAR (official XBRL data from 10-K and 10-Q filings). Requests carry a
  contact User-Agent and are throttled to 8 per second, inside the SEC's 10-per-second fair-access limit.
- **Market data:** Finnhub (price, 52-week range, beta, share count) through an official API key.
- No financial figure is hardcoded. Missing data is shown as "n/a" with the reason.

## How it is put together

- `src/lib/sec/` reads SEC data: ticker lookup, statements, LTM, debt (from the face of the balance
  sheet), segments, and the Item 1 business description.
- `src/lib/finance/` holds the pure calculations: EV bridge, multiples, margins, tie-out checks.
- `src/lib/market/` is the market-data client.
- `src/app/` is the website (Next.js). `tests/` holds the automated tests, including hand-checked
  worked examples.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

```bash
npm test          # automated tests
npm run typecheck # type checks
```

## Hosting

Deployed on Vercel's free Hobby plan, which rebuilds the site whenever the `main` branch changes. Two
settings are required there (Project → Settings → Environment Variables): `SEC_USER_AGENT` and
`FINNHUB_API_KEY`. See `.env.example`.

Educational project. Not investment advice.

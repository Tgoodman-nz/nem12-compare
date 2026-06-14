# NEM12 Rate Comparer

A web tool for Australian electricity customers that lets you upload your actual interval meter data and see what you would have paid under different electricity plans — including wholesale spot pricing.

**Live:** [nem12-compare.vercel.app](https://nem12-compare.vercel.app) *(or wherever you've deployed it)*

---

## What it does

Most electricity comparison tools use rough estimates based on typical usage profiles. This tool uses your real half-hourly consumption data — every 30-minute window for up to two years — and applies each plan's rates to your actual usage pattern. The result is a precise, apples-to-apples comparison.

You can compare:

- **Up to two fixed-rate plans** — flat rate, or time-of-use (TOU) with a separate off-peak rate and window
- **Wholesale / spot pricing** — what you'd have paid if your cost tracked the live AEMO electricity spot price (as offered by retailers like Amber Electric)

For each plan you get a total cost, a breakdown of usage vs supply charges, solar feed-in credits, and a chart of costs over time — by day, week, month, or year.

Beyond cost comparison, the tool includes two additional analysis panels:

- **Hourly usage profile** — average kWh consumed and exported per hour of the day, with a seasonal filter (Summer / Autumn / Winter / Spring) and an optional average spot price overlay on a second axis
- **Battery modelling** — models the potential annual saving from adding a home battery, across three scenarios and a range of battery sizes, with a payback calculator

---

## Getting your NEM12 file

**NEM12** is the standard format Australian electricity retailers use to store interval meter data. It's a CSV file containing your electricity consumption (and solar export, if applicable) in half-hour blocks.

To get yours:

1. Contact your retailer and ask for your **NEM12 CSV file**, or look for a **"download interval data"** option in your online account or app
2. Most retailers will provide it within a few days; some have instant self-service downloads
3. The file will typically cover up to two years of history

Your data never leaves your device — the file is read entirely in your browser.

---

## How to use it

1. **Upload your NEM12 file** — drag and drop, or click to browse
2. **Choose your NEM region** — used to fetch the correct AEMO spot prices (VIC, NSW, QLD, SA, TAS)
3. **Enter your plan rates** — name the plan, enter your peak rate (c/kWh), any off-peak rate and hours, daily supply charge, and feed-in tariff if you have solar
4. **Optionally add a second fixed plan** to compare against
5. **Configure the wholesale plan** — network charge (c/kWh), daily network standing charge, retailer subscription, and any feed-in rate
6. Click **Fetch spot prices & calculate**

The tool fetches real historical AEMO spot prices for your NEM12 date range, applies all rates to your actual interval data, and shows a full cost breakdown.

> **Note:** Fixed plan costs are calculated at the rates you enter. If your rates changed during the period, actual costs will differ. Wholesale costs use real historical AEMO spot prices and are not affected by this.

---

## Plan configuration guide

### Fixed plans

| Field | What to enter |
|---|---|
| Peak / flat rate (c/kWh) | Your standard usage rate |
| Daily supply charge (c/day) | The fixed daily charge on your bill |
| Off-peak rate (c/kWh) | Lower rate during off-peak hours (TOU plans only) |
| Off-peak window | Start and end time of the off-peak period (AEST) |
| Feed-in tariff (c/kWh) | Credit rate for solar export — 0 if no solar |
| Rates include GST | Tick if the rates you entered already include GST |

### Wholesale / spot plan (e.g. Amber Electric)

| Field | What to enter |
|---|---|
| Network/distribution rate (c/kWh) | Per-kWh charge from your network distributor, passed through by the retailer. Check your bill — VIC ≈ 9 c/kWh. **Enter excl. GST.** |
| Daily network supply charge (c/day) | Daily standing charge from your network distributor. Check your bill — VIC ≈ 80–170 c/day. **Enter excl. GST.** |
| Daily retailer subscription (c/day) | The retailer's plan fee. Amber ≈ 82.19 c/day ($25/month). **Enter inc. GST.** |
| Retailer margin (c/kWh) | Any per-kWh margin the retailer adds on top of spot. Amber = 0. **Enter excl. GST.** |
| Feed-in tariff (c/kWh) | Credit rate for solar export. **Enter excl. GST.** |

GST is added automatically to all wholesale per-kWh and daily network fields. The subscription is taken as-is (retailers quote it inc. GST).

---

## Hourly usage profile

Below the cost comparison results, the tool shows a bar chart of your **average kWh consumed and exported per hour of the day** — the shape of your typical day, not just the total.

- **X-axis:** hour of the day (12am → 11pm)
- **Y-axis (left):** average kWh consumed (orange) and exported to grid (blue) per hour
- **Y-axis (right):** average spot price in c/kWh (purple line) — only shown when spot data was fetched

The **season selector** filters the data to Summer (Dec–Feb), Autumn (Mar–May), Winter (Jun–Aug), or Spring (Sep–Nov), using Southern Hemisphere calendar conventions. Selecting "All year" includes every day in the dataset.

The spot price line is aligned to the same hour-of-day grouping as the consumption bars, so you can see directly whether your usage peaks coincide with expensive or cheap periods — and identify which hours are best for load-shifting or battery discharge.

> Spot price averages are computed from the 30-minute block-end timestamps in the fetched data. Negative hourly averages can occur but are rare — they require negative prices to outnumber positive ones across enough days in the filtered season.

---

## Battery modelling

The battery model answers: *"How much would a home battery have saved me, and how long would it take to pay off?"*

It replays your actual interval data day by day, simulating a virtual battery, and computes the annual saving under three scenarios. Results are shown for each configured plan (fixed and/or wholesale), since battery value depends heavily on the price spread the plan creates.

### Three scenarios

| Scenario | Strategy | What it represents |
|---|---|---|
| **Pessimistic** | Charges from solar export only; discharges whenever consuming from grid | A basic battery with no smart control — solar self-consumption only, no grid charging |
| **Optimistic** | Charges from solar export + cheapest ⅓ of grid intervals each day; discharges at most expensive ⅓ | A smart battery controller with good day-ahead price forecasting |
| **Best case** | Charges from solar export + cheapest ½ of grid intervals; discharges at most expensive ½ | Theoretical near-optimum — perfect knowledge of the day's prices |

All three scenarios carry the battery's state of charge (SOC) over from day to day, so residual charge is never wasted at midnight.

### Battery parameters

| Field | Default | Notes |
|---|---|---|
| Max charge/discharge (kW) | 5 kW | The battery's rated power — limits how much can flow per interval |
| Round-trip efficiency (%) | 90% | Charging losses: 1 kWh in → 0.9 kWh stored and available to discharge |
| Installed cost ($/kWh capacity) | $800/kWh | Used only for payback calculation; doesn't affect the simulated savings |

### Outputs

**Saving vs battery size chart** — plots annual saving ($/yr) against battery size (5–30 kWh) for each scenario. The curve shows diminishing returns as the battery gets larger relative to your daily solar surplus and price spread. The inflection point suggests the optimal size.

**$ summary cards** — for a selected battery size, each scenario shows:
- Annual saving in $/yr (annualised from your actual data)
- Payback period in years (`installed cost ÷ annual saving`)
- kWh cycled per year through the battery

### How savings are calculated

For each interval in each day, the simulator computes the revised grid import/export after the battery acts, then compares the cost to the original:

```
saving = original_usage_cost − revised_usage_cost
```

Supply charges are excluded — they're fixed per day and cancel out. For grid charging intervals, the battery *increases* import at the cheap price; for discharge intervals, it *reduces* import at the expensive price. The net saving is the arbitrage gain minus the opportunity cost of solar not exported.

Fixed plans are simulated across all NEM12 days. Wholesale is simulated only over days where spot price data was fetched. Both are then annualised independently (`total_saving × 365.25 ÷ days_in_dataset`).

> Battery savings are indicative. Real-world results depend on battery degradation, installer configuration, network tariff structure, and whether the retailer allows spot-price export. The "best case" scenario assumes perfect price foresight — achievable by no real controller.

---

## How it works

### NEM12 parsing

The NEM12 file is parsed entirely client-side. The parser:

- Strips UTF-8 BOM characters (common in retailer exports)
- Reads `200` records to identify the NMI (meter ID) and register — preferring `E1` (import/consumption) over other registers
- Reads `300` records containing the half-hourly interval values in kWh
- Ignores `B1` (solar export) and other registers to avoid double-counting
- Uses a `Map<date, record>` so the last record for any given date wins — this correctly handles NEM12 correction/substitution records, which retailers sometimes issue when meter data is revised

### Spot price fetching

Historical spot prices are fetched from the [OpenElectricity API](https://openelectricity.org.au) (v4). Because the API limits requests to 8 days of 5-minute data per call, the date range is automatically split into 7-day chunks and fetched concurrently (up to 10 at a time). Chunks older than the API's 730-day history window are silently skipped.

The 5-minute dispatch prices are averaged into 30-minute blocks to match the NEM12 interval length, using the same block-end convention as NEM12 (`YYYYMMDD-HH:MM` in AEST, UTC+10, no DST).

### Calculation

For each day in the NEM12 data, the calculator applies each plan's rates to each half-hour interval. Off-peak windows that wrap midnight (e.g. 22:00–07:00) are handled correctly.

**Fair comparison:** only days where spot price data exists are included in the comparison. This ensures fixed-plan and wholesale costs are calculated over exactly the same period.

**Wholesale cost per interval:**

```
cost = (spot_price_$/MWh ÷ 10 + network_c/kWh + margin_c/kWh) × 1.1 (GST) × kWh ÷ 100
```

If no spot data exists for a specific interval (e.g. an API gap), only the network and margin component is applied.

**Daily supply cost (wholesale):**

```
supply = (network_standing_charge_c/day × 1.1) + retailer_subscription_c/day
```

The subscription is entered and stored inc. GST; the network standing charge is entered excl. GST and multiplied by 1.1.

---

## Running locally

```bash
git clone https://github.com/Tgoodman-nz/nem12-compare.git
cd nem12-compare
npm install
```

Create a `.env.local` file with your OpenElectricity API key:

```
VITE_OE_API_KEY=your_key_here
```

You can get a free API key at [openelectricity.org.au](https://openelectricity.org.au).

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### Other commands

```bash
npm run build    # production build (outputs to dist/)
npm run preview  # serve the production build locally
npm run lint     # ESLint
```

---

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the repo at [vercel.com](https://vercel.com/new)
3. In **Settings → Environment Variables**, add `VITE_OE_API_KEY` with your OpenElectricity API key
4. Deploy — Vercel auto-detects Vite and uses `npm run build` with output from `dist/`

Subsequent pushes to `master` trigger automatic redeployments.

---

## Tech stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Charts | Recharts |
| Spot price data | OpenElectricity API v4 (AEMO) |
| Styling | Plain CSS |
| Deployment | Vercel |

No backend. No database. No tracking. All computation happens in the browser.

---

## Limitations

- **Fixed plan rate changes** — if your electricity rates changed during the comparison period, the fixed plan totals will not reflect those changes. Enter your current rate for a forward-looking estimate, or your historical rate for a retrospective one.
- **Network charge accuracy** — the per-kWh network charge and daily standing charge vary by distributor and tariff. Check your actual bill for the correct figures.
- **Spot price history** — the OpenElectricity API provides up to 730 days of 5-minute spot price history. NEM12 data older than this will not have a wholesale comparison.
- **Single NMI** — multi-NMI files are not supported; only the first NMI is processed.
- **30-minute intervals only** — 5-minute interval meters are not yet supported (though NEM12 files from most residential retailers use 30-minute intervals).
- **Battery model is indicative** — the simulation uses perfect or near-perfect price foresight and ignores battery degradation, installer configuration limits, network export constraints, and dynamic retailer pricing rules. Treat it as a planning tool, not a financial projection.
- **Gross solar generation not available** — NEM12 records net import/export at the meter, not gross generation. The battery model works from net intervals, so solar self-consumption already happening before the meter is invisible to the simulation.
- **Seasonal spot price coverage** — if your NEM12 file spans multiple years but the OpenElectricity API only has spot data for the most recent 730 days, earlier seasons may be absent from the wholesale and battery calculations.

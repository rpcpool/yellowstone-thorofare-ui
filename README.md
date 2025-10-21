# Yellowstone Thorofare UI

Web interface for visualizing geyser endpoint benchmark results.

Live: https://thorofare.triton.one/

## What it does

Takes the JSON output from yellowstone-thorofare benchmarks and shows you what's actually happening with your endpoints. Timeline views for slot progression, scatter plots for account updates, percentile distributions.

## Running locally
```bash
pnpm install
pnpm dev
```

Build for production:
```bash
pnpm build
```

## Usage

1. Run the benchmark CLI to get a JSON file (https://github.com/rpcpool/yellowstone-thorofare)
2. Load it to the UI
3. Look at the data

## What you're looking at

### Timeline
Shows all 6 slot stages for each slot. Blue is download time, green is replay, orange is confirmation. Clock icons show which endpoint was slower.

### Account updates
Scatter plot where each dot is an account update. Y-axis is delay in ms. Shows you which endpoint delivers updates faster.

### Metrics
P50/P90/P99 for all the timing metrics. Tight percentiles = consistent performance. Wide spread = unpredictable.

## Data format

Expects the JSON format from yellowstone-thorofare v0.2.0+. Won't work with older versions.

## Contributing

Things that would help:
- Better mobile layout
- Comparison of multiple benchmark runs

Submit PRs against main.

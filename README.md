# Sync ConvertKit

This is a simple script to sync egghead's purchases data for TestingJavaScript
and EpicReact with my mailing list so folks have the correct tags and therefore
get the right emails sent to them.

## Usage

Get a `data.csv` from egghead friends. It should have the following fields:

```csv
first_name,email,level
```

Then create a `finished.csv` with the following fields:

```csv
id,changed,first_name,email,levels,needs,remove,previous_first_name
```

Then copy `.env.example` to `.env` and fill in the values.

Then run `node update-data.js`

And wait until it's done.

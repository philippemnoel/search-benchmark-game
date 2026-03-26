import React, { useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function formatPercentVariation(p) {
  if (p !== undefined) {
    return "+" + (p * 100).toFixed(1) + " %";
  } else {
    return "";
  }
}

function numberWithCommas(x) {
  x = x.toString();
  let pattern = /(-?\d+)(\d{3})/;
  while (pattern.test(x)) {
    x = x.replace(pattern, "$1,$2");
  }
  return x;
}

function stats(timings) {
  let median = timings[(timings.length / 2) | 0];
  let mean = timings.reduce((pv, cv) => pv + cv, 0) / timings.length;
  return {
    median: median,
    mean: mean,
    min: timings[0],
    max: timings[timings.length - 1],
  };
}

function aggregate(query) {
  if (query.duration.length === 0) {
    return { query: query.query, className: "unsupported", unsupported: true };
  }
  var res = stats(query.duration);
  res.count = query.count;
  res.query = query.query;
  return res;
}

function StatsRow({ engines, name, className, stat }) {
  return (
    <tr className={className + "-row"}>
      <td>{name}</td>
      {Object.entries(engines).map(([engine, engineStats]) => {
        if (engineStats !== undefined) {
          return (
            <td key={"result-" + engine}>
              {numberWithCommas(engineStats[stat])} μs
            </td>
          );
        } else {
          return (
            <td key={"result-" + engine}>Some Unsupported Queries</td>
          );
        }
      })}
    </tr>
  );
}

function DetailsList({ details }) {
  return (
    <ul className="details">
      {details.map((detail, i) => (
        <li key={i}>{detail}</li>
      ))}
    </ul>
  );
}

function generateDataView(data, mode, tag) {
  var engines = {};
  var queries = {};
  var details = data.details;
  var modeData = data.results[mode];

  for (var engine in modeData) {
    var engineQueries = modeData[engine];
    if (tag !== null) {
      engineQueries = engineQueries.filter(
        (query) => query.tags.indexOf(tag) >= 0
      );
    }
    engineQueries = Array.from(engineQueries).map(aggregate);

    var total = 0;
    var unsupported = false;
    var allLatencies = [];
    for (var query of engineQueries) {
      if (query.unsupported) {
        unsupported = true;
      } else {
        total += query.min;
        allLatencies.push(query.min);
      }
    }

    var p50, p90, p99;
    if (unsupported) {
      total = undefined;
      p50 = undefined;
      p90 = undefined;
      p99 = undefined;
    } else {
      total = (total / engineQueries.length) | 0;
      if (allLatencies.length !== 0) {
        allLatencies.sort(function (a, b) {
          return a - b;
        });
        p50 = allLatencies[Math.round((allLatencies.length - 1) * 0.5)];
        p90 = allLatencies[Math.round((allLatencies.length - 1) * 0.9)];
        p99 = allLatencies[Math.round((allLatencies.length - 1) * 0.99)];
      }
    }

    engines[engine] = unsupported
      ? undefined
      : { average: total, p50: p50, p90: p90, p99: p99 };

    for (let q of engineQueries) {
      var queryData = {};
      if (queries[q.query] !== undefined) {
        queryData = queries[q.query];
      }
      queryData[engine] = q;
      queries[q.query] = queryData;
    }
  }

  for (let queryName in queries) {
    let queryData = queries[queryName];
    var minEngine = null;
    var minMicrosecs = 0;
    var maxEngine = null;
    var maxMicrosecs = 0;
    for (let eng in queryData) {
      var engData = queryData[eng];
      if (engData.unsupported) continue;
      if (minEngine == null || engData.min < minMicrosecs) {
        minEngine = eng;
        minMicrosecs = engData.min;
      }
      if (maxEngine == null || engData.min > maxMicrosecs) {
        maxEngine = eng;
        maxMicrosecs = engData.min;
      }
    }
    for (let eng in queryData) {
      let engData = queryData[eng];
      if (engData.unsupported) continue;
      if (eng !== minEngine) {
        engData.variation = (engData.min - minMicrosecs) / minMicrosecs;
      }
    }
    if (minEngine != null) {
      queryData[minEngine].className = "fastest";
      queryData[maxEngine].className = "slowest";
    }
  }

  return { engines, queries, details };
}

function Benchmark({ data, tags, modes }) {
  const [mode, setMode] = useState("TOP_10");
  const [tag, setTag] = useState(null);

  const dataView = useMemo(
    () => generateDataView(data, mode, tag),
    [data, mode, tag]
  );

  return (
    <div>
      <form>
        <fieldset>
          <label htmlFor="collectionField">Collection type</label>
          <select
            id="collectionField"
            onChange={(e) => setMode(e.target.value)}
          >
            {modes.map((m) => (
              <option value={m} key={m}>
                {m}
              </option>
            ))}
          </select>
          <label htmlFor="queryTagField">Type of Query</label>
          <select
            id="queryTagField"
            onChange={(e) =>
              setTag(e.target.value === "ALL" ? null : e.target.value)
            }
          >
            <option value="ALL" key="all">
              ALL
            </option>
            {tags.map((t) => (
              <option value={t} key={t}>
                {t}
              </option>
            ))}
          </select>
        </fieldset>
      </form>
      <hr />
      <table>
        <thead>
          <tr>
            <th>Query</th>
            {Object.keys(dataView.engines).map((engine) => (
              <th key={"col-" + engine}>
                <details>
                  <summary>{engine}</summary>
                  <DetailsList details={dataView.details[engine]} />
                </details>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <StatsRow
            engines={dataView.engines}
            name="AVERAGE"
            className="average"
            stat="average"
          />
          <StatsRow
            engines={dataView.engines}
            name="P50"
            className="percentile"
            stat="p50"
          />
          <StatsRow
            engines={dataView.engines}
            name="P90"
            className="percentile"
            stat="p90"
          />
          <StatsRow
            engines={dataView.engines}
            name="P99"
            className="percentile"
            stat="p99"
          />
          {Object.entries(dataView.queries).map(([queryName, engineQueries]) => (
            <tr key={queryName}>
              <td>{queryName}</td>
              {Object.keys(dataView.engines).map((engine) => {
                var cellData = engineQueries[engine];
                if (cellData.unsupported) {
                  return (
                    <td
                      key={engine}
                      className={"data " + cellData.className}
                    ></td>
                  );
                } else {
                  return (
                    <td
                      key={engine}
                      className={"data " + (cellData.className || "")}
                    >
                      <div className="timing">
                        {numberWithCommas(cellData.min)} μs
                      </div>
                      <div className="timing-variation">
                        {formatPercentVariation(cellData.variation)}
                      </div>
                      <div className="count">
                        {numberWithCommas(cellData.count)} docs
                      </div>
                    </td>
                  );
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

fetch(import.meta.env.BASE_URL + "results.json")
  .then((res) => res.json())
  .then((data) => {
    const modes = Object.keys(data.results);
    const engines = Object.keys(data.results[modes[0]]);
    const tagsSet = new Set();
    for (const query of data.results[modes[0]][engines[0]]) {
      for (const t of query.tags) {
        tagsSet.add(t);
      }
    }
    const tags = Array.from(tagsSet).sort();

    const root = createRoot(document.getElementById("app-container"));
    root.render(
      <React.StrictMode>
        <Benchmark data={data} tags={tags} modes={modes} />
      </React.StrictMode>
    );
  });

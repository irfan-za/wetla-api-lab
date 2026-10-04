import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AssignmentResult,
  type ClientQuery,
  createClient,
  type RequestRecord,
} from "../lib/client";
import {
  type Attributes,
  locationParams,
  type Method,
  pointParams,
  text,
} from "../lib/wetla";

type Phase = "idle" | "loading" | "success" | "error" | "aborted";
export interface LoadState {
  phase: Phase;
  message: string;
}
const idle: LoadState = { phase: "idle", message: "" };
export type Comparison = Awaited<
  ReturnType<ReturnType<typeof createClient>["compareGeometry"]>
>;
const initialQuery: ClientQuery = {
  kind: "locations",
  province: "Jawa Barat",
  search: "",
  offset: 0,
  limit: 12,
  geometry: false,
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function useExplorer() {
  const mounted = useRef(false);
  const locationAbort = useRef<AbortController | null>(null);
  const selectionAbort = useRef<AbortController | null>(null);
  const comparisonAbort = useRef<AbortController | null>(null);
  const nextRequestId = useRef(0);
  const [requests, setRequests] = useState<(RequestRecord & { id: number })[]>(
    [],
  );
  const [client] = useState(() =>
    createClient({
      onRequest: (record) => {
        const logged = { ...record, id: ++nextRequestId.current };
        if (mounted.current) setRequests((previous) => [...previous, logged]);
      },
    }),
  );
  const [applied, setApplied] = useState<ClientQuery>(initialQuery);
  const [rows, setRows] = useState<Attributes[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [locations, setLocations] = useState<LoadState>(idle);
  const [selected, setSelected] = useState<Attributes | null>(null);
  const [method, setMethod] = useState<Method>("kba");
  const [recommendation, setRecommendation] = useState<AssignmentResult | null>(
    null,
  );
  const [plants, setPlants] = useState<LoadState>(idle);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [experiment, setExperiment] = useState<LoadState>(idle);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      locationAbort.current?.abort();
      selectionAbort.current?.abort();
      comparisonAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    locationAbort.current = controller;
    setRows([]);
    setHasMore(false);
    setLocations({
      phase: "loading",
      message: "Fetching location attributes…",
    });
    void client
      .query(applied, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.rows);
        setHasMore(result.hasMore);
        setLocations({
          phase: "success",
          message: `${result.rows.length} location polygons on this page`,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLocations({ phase: "error", message: message(error) });
      });
    return () => controller.abort();
  }, [applied, client]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    selectionAbort.current = controller;
    setRecommendation(null);
    const id = text(selected, `id_wetla_${method}`);
    if (!id) {
      setPlants({
        phase: "error",
        message: `This polygon has no ${method.toUpperCase()} WETLA identity.`,
      });
      return () => controller.abort();
    }
    setPlants({
      phase: "loading",
      message: `Fetching ${method.toUpperCase()} assignment pages…`,
    });
    void client
      .loadAssignments(method, id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecommendation(result);
        setPlants({
          phase: "success",
          message: result.complete
            ? `${result.plants.length} plants from ${result.pages} assignment page(s)`
            : (result.reason ?? "Partial assignment list"),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPlants({ phase: "error", message: message(error) });
      });
    return () => controller.abort();
  }, [client, selected, method]);

  function apply(query: ClientQuery) {
    // Validation before clearing preserves the currently applied query on invalid input.
    if (query.kind === "locations") locationParams(query);
    if (query.kind === "point")
      pointParams(query.longitude, query.latitude, query.offset);
    locationAbort.current?.abort();
    selectionAbort.current?.abort();
    comparisonAbort.current?.abort();
    setRows([]);
    setHasMore(false);
    setSelected(null);
    setRecommendation(null);
    setPlants(idle);
    setComparison(null);
    setExperiment(idle);
    setApplied(query);
  }
  function select(row: Attributes) {
    selectionAbort.current?.abort();
    setRecommendation(null);
    setPlants(idle);
    setSelected({ ...row });
  }
  function changeMethod(value: Method) {
    if (value === method) return;
    selectionAbort.current?.abort();
    setRecommendation(null);
    setPlants(idle);
    setMethod(value);
  }
  async function compare() {
    if (applied.kind !== "locations") return;
    comparisonAbort.current?.abort();
    const controller = new AbortController();
    comparisonAbort.current = controller;
    setComparison(null);
    setExperiment({
      phase: "loading",
      message: "Running attribute-only, then geometry query…",
    });
    try {
      const result = await client.compareGeometry(applied, controller.signal);
      if (controller.signal.aborted) return;
      setComparison(result);
      setExperiment({
        phase: "success",
        message: result.sameObjectIds
          ? "Matched polygon objectids. Compare decoded upstream bytes and elapsed times below."
          : "Polygon objectids differ. These runs are not a matched comparison.",
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setExperiment({ phase: "error", message: message(error) });
    }
  }
  function cancel(kind: "locations" | "plants" | "experiment") {
    const state: LoadState = {
      phase: "aborted",
      message: "Request cancelled. No automatic retry.",
    };
    if (kind === "locations") {
      locationAbort.current?.abort();
      setLocations(state);
    }
    if (kind === "plants") {
      selectionAbort.current?.abort();
      setPlants(state);
    }
    if (kind === "experiment") {
      comparisonAbort.current?.abort();
      setExperiment(state);
    }
  }
  const cancelExperiment = useCallback(() => {
    if (comparisonAbort.current && !comparisonAbort.current.signal.aborted)
      comparisonAbort.current.abort();
    setComparison(null);
    setExperiment(idle);
  }, []);
  return {
    applied,
    rows,
    hasMore,
    locations,
    selected,
    method,
    recommendation,
    plants,
    comparison,
    experiment,
    requests,
    apply,
    select,
    changeMethod,
    compare,
    cancel,
    cancelExperiment,
  };
}

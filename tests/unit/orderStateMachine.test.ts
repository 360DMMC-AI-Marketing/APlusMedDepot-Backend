import {
  isValidTransition,
  getNextStatuses,
  isTerminalStatus,
  ORDER_STATUSES,
} from "../../src/utils/orderStateMachine";
import type { OrderStatus } from "../../src/utils/orderStateMachine";

describe("isValidTransition", () => {
  // ── All 12 valid transitions ────────────────────────────────────────

  const validPairs: Array<[OrderStatus, OrderStatus]> = [
    ["pending_payment", "payment_processing"],
    ["pending_payment", "cancelled"],
    ["payment_processing", "payment_confirmed"],
    ["payment_processing", "pending_payment"],
    ["payment_confirmed", "awaiting_fulfillment"],
    ["awaiting_fulfillment", "partially_shipped"],
    ["awaiting_fulfillment", "cancelled"],
    ["partially_shipped", "fully_shipped"],
    ["partially_shipped", "cancelled"],
    ["fully_shipped", "delivered"],
    ["delivered", "refunded"],
    ["cancelled", "refunded"],
  ];

  it.each(validPairs)("%s → %s returns true", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  // ── Invalid "skip" attempts ─────────────────────────────────────────

  const invalidPairs: Array<[OrderStatus, OrderStatus]> = [
    ["pending_payment", "delivered"],
    ["pending_payment", "fully_shipped"],
    ["payment_confirmed", "delivered"],
    ["awaiting_fulfillment", "delivered"],
    ["delivered", "cancelled"],
    ["refunded", "pending_payment"],
    ["refunded", "cancelled"],
  ];

  it.each(invalidPairs)("%s → %s returns false", (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it("returns false for invalid current status", () => {
    expect(isValidTransition("bogus" as OrderStatus, "cancelled")).toBe(false);
  });

  it("returns false for invalid next status", () => {
    expect(isValidTransition("pending_payment", "bogus" as OrderStatus)).toBe(false);
  });

  it("returns false for self-transition", () => {
    expect(isValidTransition("pending_payment", "pending_payment")).toBe(false);
  });
});

describe("getNextStatuses", () => {
  it("returns correct transitions for each status", () => {
    expect(getNextStatuses("pending_payment")).toEqual(["payment_processing", "cancelled"]);
    expect(getNextStatuses("payment_processing")).toEqual(["payment_confirmed", "pending_payment"]);
    expect(getNextStatuses("payment_confirmed")).toEqual(["awaiting_fulfillment"]);
    expect(getNextStatuses("awaiting_fulfillment")).toEqual(["partially_shipped", "cancelled"]);
    expect(getNextStatuses("partially_shipped")).toEqual(["fully_shipped", "cancelled"]);
    expect(getNextStatuses("fully_shipped")).toEqual(["delivered"]);
    expect(getNextStatuses("delivered")).toEqual(["refunded"]);
    expect(getNextStatuses("cancelled")).toEqual(["refunded"]);
  });

  it("returns empty array for terminal status (refunded)", () => {
    expect(getNextStatuses("refunded")).toEqual([]);
  });

  it("returns empty array for invalid status", () => {
    expect(getNextStatuses("bogus" as OrderStatus)).toEqual([]);
  });
});

describe("isTerminalStatus", () => {
  it("returns true for refunded", () => {
    expect(isTerminalStatus("refunded")).toBe(true);
  });

  const nonTerminal: OrderStatus[] = ORDER_STATUSES.filter((s) => s !== "refunded");

  it.each(nonTerminal)("%s is not terminal", (status) => {
    expect(isTerminalStatus(status)).toBe(false);
  });

  it("returns false for invalid status", () => {
    expect(isTerminalStatus("bogus" as OrderStatus)).toBe(false);
  });
});

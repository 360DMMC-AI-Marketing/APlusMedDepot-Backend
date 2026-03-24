import { timeQuery } from "../../../src/utils/queryTimer";

describe("queryTimer", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns the query result in development mode", async () => {
    process.env.NODE_ENV = "development";
    const result = await timeQuery("test-query", async () => ({ data: "hello" }));
    expect(result).toEqual({ data: "hello" });
  });

  it("returns the query result in production mode (no-op)", async () => {
    process.env.NODE_ENV = "production";
    const result = await timeQuery("test-query", async () => 42);
    expect(result).toBe(42);
  });

  it("logs a warning for slow queries in development", async () => {
    process.env.NODE_ENV = "development";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await timeQuery("slow-query", async () => {
      // Simulate a slow query
      await new Promise((resolve) => setTimeout(resolve, 250));
      return "done";
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[SLOW QUERY] slow-query:"));
  });

  it("does not log for fast queries in development", async () => {
    process.env.NODE_ENV = "development";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await timeQuery("fast-query", async () => "instant");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not log anything in production even for slow queries", async () => {
    process.env.NODE_ENV = "production";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await timeQuery("prod-query", async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return "done";
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("propagates errors from the query function", async () => {
    process.env.NODE_ENV = "development";

    await expect(
      timeQuery("error-query", async () => {
        throw new Error("DB connection failed");
      }),
    ).rejects.toThrow("DB connection failed");
  });
});

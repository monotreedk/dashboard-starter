import { describe, expect, test } from "bun:test";
import { allows, parseAccess } from "../src/access.ts";

const employee = { sub: "1", roles: [], groups: ["12"], managed_groups: [] };
const admin = { sub: "2", roles: ["admin"], groups: [], managed_groups: [] };
const manager = { sub: "3", roles: [], groups: ["12", "40"], managed_groups: ["40"] };

describe("parseAccess", () => {
  test("refuses an empty rule, so a missing setting never opens the dashboard", () => {
    expect(() => parseAccess("")).toThrow();
    expect(() => parseAccess(" , ")).toThrow();
  });

  test("refuses unknown words instead of ignoring them", () => {
    expect(() => parseAccess("admin")).toThrow();
    expect(() => parseAccess("group:abc")).toThrow();
  });

  test("accepts a comma separated list", () => {
    expect(parseAccess("admins, group:12")).toHaveLength(2);
  });
});

describe("allows", () => {
  test("anyone lets every signed-in employee in", () => {
    expect(allows(parseAccess("anyone"), employee)).toBe(true);
  });

  test("admins", () => {
    const rules = parseAccess("admins");
    expect(allows(rules, admin)).toBe(true);
    expect(allows(rules, employee)).toBe(false);
  });

  test("managers means managing at least one group", () => {
    const rules = parseAccess("managers");
    expect(allows(rules, manager)).toBe(true);
    expect(allows(rules, employee)).toBe(false);
  });

  test("group and manager of a group", () => {
    expect(allows(parseAccess("group:12"), employee)).toBe(true);
    expect(allows(parseAccess("group:40"), employee)).toBe(false);
    expect(allows(parseAccess("manager:40"), manager)).toBe(true);
    expect(allows(parseAccess("manager:12"), manager)).toBe(false);
  });

  test("any matching entry is enough", () => {
    expect(allows(parseAccess("admins,group:12"), employee)).toBe(true);
  });

  test("a token without the groups claims gets in only on anyone", () => {
    const bare = { sub: "4" };
    expect(allows(parseAccess("anyone"), bare)).toBe(true);
    expect(allows(parseAccess("admins,managers,group:12"), bare)).toBe(false);
  });
});

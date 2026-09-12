import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

function workbook(name: string, rows: (string | number)[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Source");
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer };
}

async function onboard(page: Page, name: string, amount: number, weekly = false) {
  await page.goto("/data-mapping");
  await page.getByRole("button", { name: "New company", exact: true }).click();
  await page.getByLabel("Company", { exact: true }).fill(name);
  await page.locator('input[type="file"]').setInputFiles([
    workbook("finance.xlsx", [["Period","Entity","GL Code","Amount","Cost Centre","Department"],["2026-07","A","41001",amount,"0040","OPS"],["2026-07","B","41001",200,"0100","HQ"],["2026-08","A","41001",50,"0040","OPS"]]),
    workbook("mapping.xlsx", [["GL Code","GL Description","P1 - Section","P2 - Header","P3 - Sub-Header","P&L Section","Sign Convention","Notes"],["41001","Sales","Income","Gross Sales","Sales","Income","income","Approved source hierarchy"]]),
    workbook("sales.xlsx", [["Period","Entity","Channel","Revenue"],["2026-07","A","Online",30],["2026-07","B","Store",70]]),
    ...(weekly ? [
      workbook("calendar.xlsx", [["Week Start","Week End","Fin_Period","Fiscal Week","Fiscal Month","Fiscal Quarter","FY"], ["2026-07-01","2026-07-07","202701","1","1","1","FY27"],["2026-07-08","2026-07-14","202702","2","1","1","FY27"],["2026-07-15","2026-07-21","202703","3","1","1","FY27"]]),
      workbook("weekly.xlsx", [["Period","Entity","Channel","Revenue"],["202701","A","Online",11],["202702","B","Store",22]]),
    ] : []),
  ]);
  const finance = page.locator('[id^="review-"] > section').filter({ hasText: "finance.xlsx ·" });
  // Source classification and scenario are real UI decisions, not fixture shortcuts.
  await finance.getByLabel("Dataset type").selectOption("finance_actual");
  await finance.getByLabel("Scenario", { exact: true }).selectOption("actual");
  const mapping = page.locator('[id^="review-"] > section').filter({ hasText: "mapping.xlsx ·" });
  await mapping.getByLabel("Dataset type").selectOption("gl_mapping");
  const sales = page.locator('[id^="review-"] > section').filter({ hasText: "sales.xlsx ·" });
  await sales.getByLabel("Dataset type").selectOption("sales");
  if (weekly) {
    await page.locator('[id^="review-"] > section').filter({hasText:"calendar.xlsx ·"}).getByLabel("Dataset type").selectOption("financial_calendar");
    await page.locator('[id^="review-"] > section').filter({hasText:"weekly.xlsx ·"}).getByLabel("Dataset type").selectOption("sales");
  }
  // Every ambiguous block must be explicitly confirmed; weekly pivot-like blocks
  // commonly require it even when the first sales table did not.
  const confirmations = page.getByRole("button", { name: "Confirm selected range" });
  while (await confirmations.count()) await confirmations.first().click();
  await finance.getByText(/Field mapping review/).click();
  await finance.getByLabel("Canonical field for GL Code", { exact: true }).selectOption("accountId");
  await expect(finance.getByLabel("headerRow", { exact: true })).toBeVisible();
  await expect(finance.getByLabel("Raw worksheet preview")).toBeVisible();
  await page.locator("#hierarchy-review tbody select").selectOption("grossSales");
  await expect(page.getByRole("button", { name: "Activate reporting dataset" }), await page.locator("#activation-review").innerText()).toBeEnabled();
  await page.getByRole("button", { name: "Activate reporting dataset" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("activate, refresh, switch companies and preserve onboarding controls", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await onboard(page, "Runtime Company A", 100);
  const firstCompany = await page.getByLabel("Reporting company", { exact: true }).inputValue();
  await page.getByLabel("Period", { exact: true }).selectOption("2026-07");
  await page.getByLabel("Basis", { exact: true }).selectOption("MTD");
  await expect(page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Net Sales", exact: true }) }).first()).toContainText("300");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Runtime Company A", exact: true })).toBeVisible();
  await expect(page.getByLabel("Reporting company", { exact: true })).toHaveValue(firstCompany);
  await page.goto("/balance-sheet");
  await expect(page.getByRole("status")).toContainText("Balance Sheet data has not been configured");
  for (const route of ["cash-flow", "forecasts", "kpis", "variance"]) {
    await page.goto(`/${route}`);
    await expect(page.getByRole("status")).toContainText("has not been configured for this company");
    await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
  }
  await page.goto("/sales");
  await expect(page.getByText("Weekly sales data has not been mapped.")).toBeVisible();
  await page.getByLabel("Period", { exact: true }).selectOption("2026-07");
  await expect(page.getByText("$100", { exact: true })).toBeVisible();
  await onboard(page, "Runtime Company B", 500);
  const secondCompany = await page.getByLabel("Reporting company", { exact: true }).inputValue();
  await page.getByLabel("Reporting company", { exact: true }).selectOption("demo");
  await page.getByLabel("Reporting company", { exact: true }).selectOption(firstCompany);
  await expect(page.getByRole("heading", { name: "Runtime Company A", exact: true })).toBeVisible();
  await expect(page.getByLabel("Entity", { exact: true })).toHaveValue("company");
  await expect(page.getByLabel("Period", { exact: true })).toHaveValue("2026-08");
  await page.getByLabel("Reporting company", { exact: true }).selectOption(secondCompany);
  await expect(page.getByRole("heading", { name: "Runtime Company B", exact: true })).toBeVisible();
  await page.goto("/data-mapping");
  await expect(page.getByLabel("headerRow", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Raw worksheet preview").first()).toBeVisible();
  await expect(page.getByText(/Field mapping review/).first()).toBeVisible();
  await page.locator("#hierarchy-review select").first().selectOption("all");
  await expect(page.locator("#hierarchy-review tbody select")).toHaveValue("grossSales");
  await expect(page.getByText("Previously activated · review changes before reactivation")).toBeVisible();
  const finance = page.locator('[id^="review-"] > section').filter({ hasText: "finance.xlsx ·" });
  await finance.getByLabel("endRow", { exact: true }).fill("3");
  await finance.getByText(/Field mapping review/).click();
  await finance.getByLabel("Canonical field for Department", { exact: true }).selectOption("ignore");
  await page.getByRole("link", { name: "Sales", exact: true }).click();
  await page.getByRole("link", { name: "Data & Mapping", exact: true }).click();
  await expect(finance.getByLabel("endRow", { exact: true })).toHaveValue("3");
  await finance.getByText(/Field mapping review/).click();
  await expect(finance.getByLabel("Canonical field for Department", { exact: true })).toHaveValue("ignore");
  await page.reload();
  await expect(finance.getByLabel("endRow", { exact: true })).toHaveValue("3");
  await page.locator("#hierarchy-review select").first().selectOption("all");
  await expect(page.locator("#hierarchy-review tbody select")).toHaveValue("grossSales");
  await expect(page.getByRole("button", { name: "Activate reporting dataset" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("uploaded weekly calendar facts reach the live Sales page", async ({ page }) => {
  await onboard(page, "Weekly Runtime", 100, true);
  await page.getByRole("link", {name:"Sales",exact:true}).click();
  await page.getByLabel("Period", {exact:true}).selectOption("2026-07");
  await expect(page.getByRole("row").filter({hasText:"FY27 W1"})).toContainText("$11");
  await expect(page.getByRole("row").filter({hasText:"FY27 W2"})).toContainText("$22");
  await expect(page.getByRole("row").filter({hasText:"FY27 W1"})).toContainText("Unavailable");
  await page.getByLabel("Entity", {exact:true}).selectOption("A");
  await expect(page.getByRole("row").filter({hasText:"FY27 W2"})).toContainText("$0");
  await page.reload();
  await expect(page.getByRole("heading", {name:"Weekly Runtime",exact:true})).toBeVisible();
  await expect(page.getByRole("row").filter({hasText:"FY27 W2"})).toContainText("$22");
});

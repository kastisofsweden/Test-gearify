import { describe, expect, it } from "vitest";

import { buildReportEmail, forwardDecision, resolveExternalReportTarget } from "./unitReportEmail";

describe("resolveExternalReportTarget", () => {
  it("returns the address only when forwarding is on", () => {
    expect(
      resolveExternalReportTarget({
        forward_reports_to_external: true,
        external_report_email: " Ops@Inderes.com ",
      }),
    ).toBe("ops@inderes.com");
    expect(
      resolveExternalReportTarget({
        forward_reports_to_external: false,
        external_report_email: "ops@inderes.com",
      }),
    ).toBeNull();
  });
  it("ignores missing or invalid addresses", () => {
    expect(
      resolveExternalReportTarget({
        forward_reports_to_external: true,
        external_report_email: null,
      }),
    ).toBeNull();
    expect(
      resolveExternalReportTarget({
        forward_reports_to_external: true,
        external_report_email: "nope",
      }),
    ).toBeNull();
  });
});

describe("forwardDecision", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 10, 5, 12, min)).toISOString();
  it("sends a first report", () => {
    expect(forwardDecision({ message: "Trasig", created_at: at(30) }, [])).toBe("send");
  });
  it("skips an identical message within the hour", () => {
    expect(
      forwardDecision({ message: " trasig  ", created_at: at(30) }, [
        { message: "Trasig", external_notified_at: at(10) },
      ]),
    ).toBe("duplicate");
  });
  it("caps at 5 forwards per unit per hour", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ message: `m${n}`, external_notified_at: at(n) }));
    expect(forwardDecision({ message: "new", created_at: at(30) }, five)).toBe("rate_limited");
  });
});

describe("buildReportEmail", () => {
  it("escapes user input in HTML and uses Stockholm time", () => {
    const e = buildReportEmail({
      unitName: "TV <b>",
      serialCode: "IS001-TV001",
      reportType: "fault",
      message: `<script>alert("x")</script>`,
      reporterName: "A & B",
      createdAt: "2026-11-05T12:00:00Z",
      adminUrl: "https://qr.renthub.se/admin?tab=reports",
    });
    expect(e.subject).toBe("Fault report: TV <b> (IS001-TV001)");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("A &amp; B");
    expect(e.text).toContain("13:00");
  });
});

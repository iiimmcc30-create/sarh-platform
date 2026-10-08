import { formatSinceAr, profileSinceLabel } from "@/lib/accountAge";

const NOW = Date.parse("2026-10-08T00:00:00.000Z");

describe("formatSinceAr", () => {
  it("uses years, months, then days, and refuses missing or future dates", () => {
    expect(formatSinceAr(null, NOW)).toBeNull();
    expect(formatSinceAr("not-a-date", NOW)).toBeNull();
    expect(formatSinceAr("2027-01-01T00:00:00.000Z", NOW)).toBeNull();
    expect(formatSinceAr("2018-10-08T00:00:00.000Z", NOW)).toBe("منذ 8 سنوات");
    expect(formatSinceAr("2025-10-08T00:00:00.000Z", NOW)).toBe("منذ سنة");
    expect(formatSinceAr("2024-10-08T00:00:00.000Z", NOW)).toBe("منذ سنتين");
    expect(formatSinceAr("2026-07-08T00:00:00.000Z", NOW)).toBe("منذ 3 أشهر");
    expect(formatSinceAr("2026-10-06T00:00:00.000Z", NOW)).toBe("منذ يومين");
    expect(formatSinceAr("2026-10-08T00:00:00.000Z", NOW)).toBe("منذ اليوم");
  });

  it("prefers the join date and only then verifiedSince", () => {
    expect(
      profileSinceLabel(
        { createdAt: "2018-10-08T00:00:00.000Z", verifiedSince: "2024-01-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("منذ 8 سنوات");
    expect(profileSinceLabel({ verifiedSince: "2024-10-08T00:00:00.000Z" }, NOW)).toBe(
      "موثّق منذ سنتين",
    );
    expect(profileSinceLabel({}, NOW)).toBeNull();
  });
});

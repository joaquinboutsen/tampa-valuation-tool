import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

/** The preview card shown when the site's link is shared (for example on LinkedIn). */
export const alt = `${SITE.name} by ${SITE.author}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12284b",
          color: "#ffffff",
          padding: "70px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#d9c39a", letterSpacing: 2 }}>VALUATION TOOLKIT</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.12 }}>A banker&apos;s valuation package for any US public company.</div>
          <div style={{ display: "flex", fontSize: 30, marginTop: 28, color: "#c9d3e3" }}>
            Trading comps · DCF · Football field · Merger model · Built on SEC filings
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#c9d3e3", borderTop: "2px solid #9a7b3f", paddingTop: 22 }}>
          <div style={{ display: "flex" }}>{SITE.author}</div>
          <div style={{ display: "flex" }}>Master&apos;s in Finance, University of Tampa</div>
        </div>
      </div>
    ),
    size,
  );
}

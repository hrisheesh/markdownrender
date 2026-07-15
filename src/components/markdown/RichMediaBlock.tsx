"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useMemo } from "react";
import JSON5 from "json5";
import { ExternalLink, FileText, MapPin, Play } from "lucide-react";

import { useMarkdownFlowClass } from "./presentation";

type MediaType = "embed" | "image" | "map";
type MediaConfig = {
  title?: string;
  url?: string;
  kind?: "link" | "video" | "document";
  description?: string;
  publisher?: string;
  layout?: "gallery" | "before-after";
  images?: { src: string; alt?: string; caption?: string; label?: string }[];
  locations?: { name: string; detail?: string; x: number; y: number }[];
};

function InvalidBlock() {
  const className = useMarkdownFlowClass("fallback", "mf-block", "mf-fallback");
  return <div role="alert" className={className}>This block needs a valid JSON configuration.</div>;
}

function safeUrl(url?: string) {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null; } catch { return null; }
}

function Embed({ config }: { config: MediaConfig }) {
  const className = useMarkdownFlowClass("embed", "mf-block", "mf-media", "mf-embed");
  const url = safeUrl(config.url);
  if (!url) return <InvalidBlock />;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const Icon = config.kind === "video" ? Play : config.kind === "document" ? FileText : ExternalLink;
  return <aside className={className}><div className="mf-embed-layout"><span className="mf-embed-icon" aria-hidden="true"><Icon /></span><div className="mf-embed-content"><p className="mf-block-eyebrow">{config.publisher || host}</p><h3 className="mf-block-title">{config.title || host}</h3>{config.description && <p className="mf-block-copy">{config.description}</p>}</div><a href={url} target="_blank" rel="noreferrer" className="mf-embed-action">Open preview <ExternalLink aria-hidden="true" /></a></div></aside>;
}

function ImageBlock({ config }: { config: MediaConfig }) {
  const className = useMarkdownFlowClass("image", "mf-block", "mf-media", "mf-image-gallery");
  const images = config.images?.filter((image) => safeUrl(image.src));
  if (!images?.length) return <InvalidBlock />;
  const beforeAfter = config.layout === "before-after" && images.length >= 2;
  return <figure className={className} data-mf-layout={beforeAfter ? "before-after" : images.length > 1 ? "gallery" : "single"}><div className="mf-image-grid">{images.map((image, index) => <div key={`image-${index}`} className="mf-image-item"><div className="mf-image-frame"><img src={safeUrl(image.src) || ""} alt={image.alt || ""} className="mf-image" loading="lazy" />{image.label && <span className="mf-image-label">{image.label}</span>}</div>{image.caption && <p className="mf-block-copy mf-image-caption">{image.caption}</p>}</div>)}</div>{config.title && <figcaption className="mf-item-meta">{config.title}</figcaption>}</figure>;
}

function Map({ config }: { config: MediaConfig }) {
  const className = useMarkdownFlowClass("map", "mf-block", "mf-media", "mf-map");
  if (!config.locations?.length) return <InvalidBlock />;
  return <section className={className}><header className="mf-block-header"><h3 className="mf-block-title">{config.title || "Geographic summary"}</h3></header><div className="mf-map-canvas" role="img" aria-label={`${config.title || "Location map"}, showing ${config.locations.length} locations`}>{config.locations.map((location, index) => <MapPin key={`location-pin-${index}`} aria-hidden="true" className="mf-map-pin" style={{ left: `${Math.min(Math.max(location.x, 0), 100)}%`, top: `${Math.min(Math.max(location.y, 0), 100)}%` }} />)}</div><ul className="mf-map-locations">{config.locations.map((location, index) => <li key={`location-detail-${index}`} className="mf-map-location"><MapPin aria-hidden="true" /><span><strong>{location.name}</strong>{location.detail && ` · ${location.detail}`}</span></li>)}</ul></section>;
}

export default function RichMediaBlock({ type, configStr }: { type: MediaType; configStr: string }) {
  const mediaClassName = useMarkdownFlowClass("media", "mf-media-scope");
  const config = useMemo<MediaConfig | null>(() => { try { return JSON5.parse(configStr.trim()); } catch { return null; } }, [configStr]);
  if (!config) return <InvalidBlock />;
  return <div className={mediaClassName}>{type === "embed" ? <Embed config={config} /> : type === "image" ? <ImageBlock config={config} /> : <Map config={config} />}</div>;
}

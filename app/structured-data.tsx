export function StructuredData({ value }: { value: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", ...value }).replaceAll(
          "<",
          "\\u003c",
        ),
      }}
    />
  );
}

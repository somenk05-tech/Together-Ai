/**
 * WHERE THIS RECORD CAME FROM, ON THE RECORD.
 *
 * Every commercial row in this hub carries its retailer, its source URL and the
 * date it was checked. It is on the product card and not buried in a modal
 * because "verified" is a claim, and a claim with no link under it is a logo.
 */

export function SourceLine({ retailer, url, date }: { retailer: string; url: string | null; date: string }) {
  return (
    <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
      Source: {retailer}
      {url && (
        <>
          {' · '}
          <a href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>listing</a>
        </>
      )}
      {' · verified '}
      {date}
    </p>
  );
}

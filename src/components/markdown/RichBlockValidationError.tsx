export default function RichBlockValidationError({ reason }: { reason: string }) {
  return (
    <div role="status" className="my-8 border-y border-black/[0.08] bg-[#fbfbfd] px-5 py-4 text-sm text-[#6e6e73]">
      This AI block could not be rendered safely. {reason}
    </div>
  );
}

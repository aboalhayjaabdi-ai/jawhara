export function TextSection({ text }: { text: string }) {
  return (
    <div className="px-6 pt-14 text-center">
      <p className="text-2xl">{text}</p>
    </div>
  );
}

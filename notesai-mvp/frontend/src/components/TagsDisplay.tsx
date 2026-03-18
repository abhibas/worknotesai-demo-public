'use client';

interface TagsDisplayProps {
  tags?: string | null;
  className?: string;
}

export default function TagsDisplay({ tags, className = '' }: TagsDisplayProps) {
  // Return null if no tags or empty string
  if (!tags || tags.trim() === '') return null;
  
  // Split tags by comma (handles both "tag1,tag2" and "tag1, tag2" formats), trim, filter out empty strings, and sort alphabetically
  const tagArray = tags
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })); // Case-insensitive alphabetical sort
  
  // Return null if no valid tags after processing
  if (tagArray.length === 0) return null;
  
  return (
    <div className={`flex flex-wrap gap-2 mt-2 ${className}`}>
      {tagArray.map((tag, idx) => (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}


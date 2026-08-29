"use client";

import { useState } from "react";
import Image from "@/components/ui/image";

interface VerticalCarouselProps {
  images: string[];
  onSelect: (src: string) => void;
  selectedImage: string;
}

export default function VerticalCarousel({
  images,
  onSelect,
}: VerticalCarouselProps) {
  const [startIndex, setStartIndex] = useState(0);
  const visibleImages = 3;
  const maxIndex = images.length - visibleImages;

  const scrollUp = () => {
    if (startIndex > 0) setStartIndex(startIndex - 1);
  };

  const scrollDown = () => {
    if (startIndex < maxIndex) setStartIndex(startIndex + 1);
  };

  return (
    <div className="relative flex flex-col h-full w-full">
      {images.length > visibleImages && (
        <button
          onClick={scrollUp}
          className="absolute -top-6 left-1/2 transform -translate-x-1/2 p-2 bg-gray-200 rounded-full hover:bg-gray-300 text-sm disabled:opacity-50"
          disabled={startIndex === 0}
          aria-label="Scroll thumbnails up"
        >
          ▲
        </button>
      )}

      <div className="flex flex-col gap-2 h-full">
        {images
          .slice(startIndex, startIndex + visibleImages)
          .map((img, index) => (
            <button
              key={index}
              onClick={() => onSelect(img)}
              // `relative` is required so that the fill-mode next/image inside
              // the ui/image wrapper has a positioned ancestor to attach to.
              className="relative w-full h-1/3 rounded-lg overflow-hidden transition"
              aria-label={`Select thumbnail ${startIndex + index + 1}`}
            >
              <Image
                src={img}
                alt={`Thumbnail ${startIndex + index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 25vw, 15vw"
              />
            </button>
          ))}
      </div>

      {images.length > visibleImages && (
        <button
          onClick={scrollDown}
          className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 p-2 bg-gray-200 rounded-full hover:bg-gray-300 text-sm disabled:opacity-50"
          disabled={startIndex >= maxIndex}
          aria-label="Scroll thumbnails down"
        >
          ▼
        </button>
      )}
    </div>
  );
}

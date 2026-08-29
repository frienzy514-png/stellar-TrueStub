"use client";

import { useState } from "react";
import Image from "@/components/ui/image";
import VerticalCarousel from "@/components/ticket-events/details/VerticalCarousel";

interface GalleryProps {
  images: string[];
}

export default function Gallery({ images }: GalleryProps) {
  const [selectedImage, setSelectedImage] = useState(images[0]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Main selected image.  `relative` is required for next/image fill mode. */}
      <div className="relative w-full md:w-3/4 aspect-video overflow-hidden rounded-lg">
        <Image
          src={selectedImage}
          alt="Selected event photo"
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 75vw"
          priority
        />
      </div>

      <div className="w-full md:w-1/4">
        <VerticalCarousel
          images={images}
          onSelect={setSelectedImage}
          selectedImage={selectedImage}
        />
      </div>
    </div>
  );
}

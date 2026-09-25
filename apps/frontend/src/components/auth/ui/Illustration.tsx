import Image from "next/image";

export default function Illustration({ className }: { className?: string }) {
   return (
     <div className={`relative hidden md:block md:w-1/2 dark:bg-gray-900 ${className || ""}`}>
       <div className="absolute mt-[15rem] inset-0 flex items-center justify-center">
         <Image
           src="/img/event-venue.png"
           alt="Events"
           width={1500}
           height={1200}
           className="object-contain dark:opacity-20 transition-opacity duration-300"
           priority
         />
       </div>
     </div>
   );
}

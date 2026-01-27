import { OpenSheetMusicDisplayView } from "@/components/OpenSheetMusicDisplayView";
import { SheetMusic } from "@/components/SheetMusic";
import labSequenceSource from "@/music/intro/output/tune.ns.json";
import type { NoteSequence } from "@/types/noteSequence";
import { getTuneXml } from "@/utils/tuneAssetGlobs";

export const LabMode = () => {
  const labSequence = labSequenceSource as NoteSequence;
  const xml = getTuneXml("intro");

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-4 overflow-auto">
      <OpenSheetMusicDisplayView
        xml={xml}
        compactness="compacttight"
        hasColor
        className="w-[800px] flex justify-center items-center"
      />
      <div className="w-full flex justify-center mt-4">
        <SheetMusic
          sequence={labSequence}
          compact
          noTitle
          noControls
          hasColor
          scale={1.1}
        />
      </div>
    </div>
  );
};

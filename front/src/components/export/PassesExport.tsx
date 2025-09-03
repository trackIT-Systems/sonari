import Button from "@/components/Button";
import Card from "@/components/Card";
import { H3 } from "@/components/Headings";

export default function PassesExport() {
  return (
    <div className="flex flex-row gap-8">
      <div className="flex flex-col gap-y-6 max-w-prose">
        <Card>
          <div>
            <H3 className="text-lg">Passes Export</H3>
            <p className="text-stone-500">Export annotation data in Passes format.</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-stone-400 mb-4">
              Passes export functionality is coming soon. This will allow you to export annotation data
              in a format optimized for pass-based workflows.
            </p>
            <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-stone-700 dark:text-stone-300 mb-2">
                Planned Features:
              </h4>
              <ul className="text-left text-stone-600 dark:text-stone-400 space-y-1">
                <li>• Export by annotation passes</li>
                <li>• Filter by pass completion status</li>
                <li>• Include pass metadata</li>
                <li>• Configurable output format</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
      
      <div className="w-96">
        <div className="sticky top-8">
          <Card>
            <H3>Coming Soon</H3>
            <p className="text-stone-500 mb-4">
              The Passes export feature is currently under development. Check back soon for updates.
            </p>
            <Button disabled className="w-full">
              Export Passes (Coming Soon)
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

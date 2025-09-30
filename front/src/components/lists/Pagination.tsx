import { useMemo } from "react";

import Button from "@/components/Button";
import * as icons from "@/components/icons";
import { Input } from "@/components/inputs/index";
import Select from "@/components/inputs/Select";
import { type Pagination as PaginationType } from "@/hooks/utils/usePagedQuery";

const pageSizeOptions = [1, 5, 10, 25, 50, 100];

// Pre-compute options array to avoid recreation on every render
const PAGE_SIZE_OPTIONS = pageSizeOptions.map((value) => ({
  label: value.toString(),
  value,
  id: value,
}));

function SetPageSize({
  pageSize,
  setPageSize,
}: {
  pageSize: number;
  setPageSize: (pageSize: number) => void;
}) {
  const selectedOption = useMemo(
    () => ({ label: pageSize.toString(), value: pageSize, id: pageSize }),
    [pageSize]
  );

  return (
    <Select
      label="Page Size:"
      selected={selectedOption}
      onChange={(value) => setPageSize(value)}
      options={PAGE_SIZE_OPTIONS}
    />
  );
}

export default function Pagination({
  page,
  numPages,
  nextPage,
  hasNextPage,
  hasPrevPage,
  prevPage,
  setPage,
  pageSize,
  setPageSize,
}: PaginationType) {
  return (
    <div className="flex flex-row space-x-2">
      <Button
        disabled={page === 0}
        onClick={() => setPage(0)}
        variant="secondary"
        mode="text"
      >
        <icons.FirstIcon className="h-5 w-5 fill-transparent stroke-inherit" />
      </Button>
      <Button
        onClick={prevPage}
        disabled={!hasPrevPage}
        variant="secondary"
        mode="text"
      >
        <icons.PreviousIcon className="h-5 w-5 fill-transparent stroke-inherit" />
      </Button>
      <div className="w-14">
        <Input
          disabled={numPages === 1}
          type="number"
          className="remove-arrow"
          value={page + 1}
          onChange={(e) => setPage(parseInt(e.target.value) - 1)}
        />
      </div>
      <Button disabled variant="secondary" mode="text">
        / {numPages}
      </Button>
      <Button
        onClick={nextPage}
        disabled={!hasNextPage}
        variant="secondary"
        mode="text"
      >
        <icons.NextIcon className="h-5 w-5 fill-transparent stroke-inherit" />
      </Button>
      <Button
        disabled={page === numPages - 1}
        onClick={() => setPage(numPages - 1)}
        variant="secondary"
        mode="text"
      >
        <icons.LastIcon className="h-5 w-5 fill-transparent stroke-inherit" />
      </Button>
      <SetPageSize pageSize={pageSize} setPageSize={setPageSize} />
    </div>
  );
}

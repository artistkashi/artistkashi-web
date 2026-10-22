import { unwrapPaginated } from "@/api/client-service";
import { listCourses, listProducts } from "@/api/openapi-client";

export interface SelectableCourse {
  id: string;
  title: string;
}

export interface SelectablePainting {
  id: string;
  title: string;
}

export async function fetchAllCourses(): Promise<SelectableCourse[]> {
  const allCourses: SelectableCourse[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await unwrapPaginated(
      listCourses({ query: { page, page_size: pageSize, is_published: true } })
    );
    allCourses.push(...result.data.map((course) => ({ id: course.id, title: course.title })));
    totalPages = result.pagination.total_pages;
    page += 1;
  }

  return allCourses;
}

export async function fetchAllPaintings(): Promise<SelectablePainting[]> {
  const allPaintings: SelectablePainting[] = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await unwrapPaginated(
      listProducts({ query: { page, page_size: pageSize } })
    );
    allPaintings.push(...result.data.map((product) => ({ id: product.id, title: product.title })));
    totalPages = result.pagination.total_pages;
    page += 1;
  }

  return allPaintings;
}

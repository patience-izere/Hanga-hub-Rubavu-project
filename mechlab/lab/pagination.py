from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Page numbers with an opt-in larger page, so a client can list a school's full set."""

    page_size_query_param = "page_size"
    max_page_size = 200

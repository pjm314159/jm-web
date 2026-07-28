"""Search API 测试（S1-S4）：搜索 / 在线详情 / 章节列表 / 在线阅读器。

网络层 jm_sync 全部 mock，不触达真实站点。
"""

from unittest.mock import patch

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


class FakePage:
    content = [
        (
            "111",
            {
                "name": "本子1",
                "author": "作者1",
                "tags": ["t1"],
                "description": "desc",
                "update_at": "1700000000",
                "category": {"title": "分类"},
            },
        )
    ]
    total = 1
    page_count = 1


class FakeImg:
    def __init__(self, url):
        self.img_url = url


class FakePhotoDetail:
    scramble_id = "220980"
    album_id = "111"

    def __init__(self, imgs):
        self._imgs = imgs

    def __iter__(self):
        return iter(self._imgs)


class FakeAlbumDetail:
    name = "本子1"
    authors = ["作者1"]
    description = "简介"
    tags = ["t1"]
    likes = 10
    views = 100
    comment_count = 5
    episode_list = [("67890", "1", "第一章")]


class TestSearch:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("search")).status_code == 401

    def test_empty_query(self, auth_client):
        resp = auth_client.get(reverse("search"), {"q": ""})
        assert resp.status_code == 200
        assert resp.data["results"] == []

    def test_keyword_search(self, auth_client):
        with (
            patch("comic.services.search.jm_sync.search_site", return_value=FakePage()) as m,
            patch(
                "comic.services.search.jm_sync.get_album_cover_url",
                return_value="http://cover/111.jpg",
            ),
        ):
            resp = auth_client.get(reverse("search"), {"q": "关键词", "type": "keyword"})
        assert resp.status_code == 200
        m.assert_called_once()
        item = resp.data["results"][0]
        assert item["jm_id"] == "111"
        assert item["name"] == "本子1"
        assert item["is_downloaded"] is False
        assert resp.data["pagination"]["total"] == 1

    def test_tag_search(self, auth_client):
        with (
            patch("comic.services.search.jm_sync.search_tag", return_value=FakePage()) as m,
            patch("comic.services.search.jm_sync.get_album_cover_url", return_value="c"),
        ):
            resp = auth_client.get(reverse("search"), {"q": "标签", "type": "tag"})
        m.assert_called_once()
        assert resp.data["search_type"] == "tag"

    def test_search_error(self, auth_client):
        with patch("comic.services.search.jm_sync.search_site", side_effect=RuntimeError("net")):
            resp = auth_client.get(reverse("search"), {"q": "x"})
        assert resp.data["error"] is not None
        assert resp.data["results"] == []

    def test_search_cache_hit(self, auth_client):
        with (
            patch("comic.services.search.jm_sync.search_site", return_value=FakePage()) as m,
            patch("comic.services.search.jm_sync.get_album_cover_url", return_value="c"),
        ):
            auth_client.get(reverse("search"), {"q": "缓存"})
            auth_client.get(reverse("search"), {"q": "缓存"})
        assert m.call_count == 1  # 第二次命中缓存


class TestSearchAlbumDetail:
    def test_detail(self, auth_client):
        with (
            patch(
                "comic.services.search.jm_sync.fetch_album_detail",
                return_value=FakeAlbumDetail(),
            ),
            patch("comic.services.search.jm_sync.get_album_cover_url", return_value="c"),
        ):
            resp = auth_client.get(reverse("search_album_detail", args=["111"]))
        assert resp.status_code == 200
        assert resp.data["album"]["name"] == "本子1"
        assert resp.data["album"]["likes"] == 10
        assert resp.data["is_downloaded"] is False

    def test_detail_502(self, auth_client):
        with patch(
            "comic.services.search.jm_sync.fetch_album_detail", side_effect=RuntimeError("net")
        ):
            resp = auth_client.get(reverse("search_album_detail", args=["111"]))
        assert resp.status_code == 502


class TestSearchAlbumEpisodes:
    def test_episodes(self, auth_client):
        with patch(
            "comic.services.search.jm_sync.fetch_album_detail", return_value=FakeAlbumDetail()
        ):
            resp = auth_client.get(reverse("search_album_episodes", args=["111"]))
        assert resp.status_code == 200
        assert resp.data["episode_list"][0]["photo_id"] == "67890"

    def test_episodes_502(self, auth_client):
        with patch(
            "comic.services.search.jm_sync.fetch_album_detail", side_effect=RuntimeError("net")
        ):
            resp = auth_client.get(reverse("search_album_episodes", args=["111"]))
        assert resp.status_code == 502


class TestSearchPhotoImages:
    def test_images(self, auth_client):
        detail = FakePhotoDetail([FakeImg("http://img/1.jpg"), FakeImg("http://img/2.jpg")])
        with (
            patch("comic.services.search.jm_sync.fetch_photo_detail", return_value=detail),
            patch("comic.services.search.jm_sync.get_num_by_url", return_value=0),
        ):
            resp = auth_client.get(reverse("search_photo_images", args=["67890"]))
        assert resp.status_code == 200
        assert resp.data["total_images"] == 2
        assert resp.data["scramble_id"] == "220980"
        assert resp.data["images"][0]["url"] == "http://img/1.jpg"

    def test_images_502(self, auth_client):
        with patch(
            "comic.services.search.jm_sync.fetch_photo_detail", side_effect=RuntimeError("net")
        ):
            resp = auth_client.get(reverse("search_photo_images", args=["67890"]))
        assert resp.status_code == 502

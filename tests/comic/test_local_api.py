"""Local API 测试（M1-M5）：文件夹列表 / 刷新 / 图片分页 / 视频列表 / Range 流。"""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def _make_image_album(media_root, name="相册A", files=("1.jpg", "2.jpg", "10.jpg")):
    folder = media_root / "images" / "local" / name
    folder.mkdir(parents=True, exist_ok=True)
    for f in files:
        (folder / f).write_bytes(b"x")
    return folder


def _make_video_folder(media_root, name="视频夹", files=("a.mp4",)):
    folder = media_root / "videos" / name
    folder.mkdir(parents=True, exist_ok=True)
    for f in files:
        (folder / f).write_bytes(b"0123456789")
    return folder


class TestLocalMedia:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("local_media")).status_code == 401

    def test_lists_image_and_video_folders(self, auth_client, media_root):
        _make_image_album(media_root)
        _make_video_folder(media_root)
        resp = auth_client.get(reverse("local_media"))
        assert resp.status_code == 200
        assert resp.data["image_albums"][0]["name"] == "相册A"
        assert resp.data["image_albums"][0]["count"] == 3
        assert resp.data["video_folders"][0]["name"] == "视频夹"

    def test_image_album_preview_urls(self, auth_client, media_root):
        _make_image_album(media_root)  # 3 张图
        resp = auth_client.get(reverse("local_media"))
        album = resp.data["image_albums"][0]
        # 堆叠预览取前 3 张，cover_url 为首张
        assert len(album["preview_urls"]) == 3
        assert album["preview_urls"][0] == album["cover_url"]

    def test_image_album_preview_urls_fewer_than_three(self, auth_client, media_root):
        _make_image_album(media_root, name="单图", files=("only.jpg",))
        resp = auth_client.get(reverse("local_media"))
        album = next(a for a in resp.data["image_albums"] if a["name"] == "单图")
        assert len(album["preview_urls"]) == 1

    def test_video_folder_cover_none_without_image(self, auth_client, media_root):
        _make_video_folder(media_root)  # 仅 a.mp4，无图片
        resp = auth_client.get(reverse("local_media"))
        assert resp.data["video_folders"][0]["cover_url"] is None

    def test_video_folder_cover_prefers_cover_file(self, auth_client, media_root):
        folder = _make_video_folder(media_root, name="有封面")
        (folder / "other.jpg").write_bytes(b"x")
        (folder / "cover.jpg").write_bytes(b"x")
        resp = auth_client.get(reverse("local_media"))
        target = next(f for f in resp.data["video_folders"] if f["name"] == "有封面")
        assert target["cover_url"].endswith("cover.jpg")


class TestLocalMediaRefresh:
    def test_refresh_rescans(self, auth_client, media_root):
        _make_image_album(media_root)
        auth_client.get(reverse("local_media"))  # 预热缓存
        _make_image_album(media_root, name="相册B")
        resp = auth_client.post(reverse("local_media_refresh"))
        assert resp.status_code == 200
        names = {a["name"] for a in resp.data["image_albums"]}
        assert names == {"相册A", "相册B"}


class TestLocalImages:
    def test_image_folder_natural_sort(self, auth_client, media_root):
        _make_image_album(media_root)
        resp = auth_client.get(reverse("local_images", args=["相册A"]))
        assert resp.status_code == 200
        names = [f["name"] for f in resp.data["files"]]
        assert names == ["1.jpg", "2.jpg", "10.jpg"]
        assert resp.data["count"] == 3

    def test_image_folder_404(self, auth_client, media_root):
        resp = auth_client.get(reverse("local_images", args=["不存在"]))
        assert resp.status_code == 404


class TestLocalVideos:
    def test_video_folder(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(reverse("local_videos", args=["视频夹"]))
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["first_video"]["name"] == "a.mp4"
        assert "/media/videos/" in resp.data["first_video"]["url"]

    def test_video_folder_404(self, auth_client, media_root):
        assert auth_client.get(reverse("local_videos", args=["不存在"])).status_code == 404


class TestVideoStream:
    def test_requires_auth(self, api_client, media_root):
        _make_video_folder(media_root)
        assert api_client.get(reverse("video_stream", args=["视频夹", "a.mp4"])).status_code == 401

    def test_full_download(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(reverse("video_stream", args=["视频夹", "a.mp4"]))
        assert resp.status_code == 200
        assert resp["Content-Length"] == "10"
        assert resp["Content-Type"] == "video/mp4"
        assert resp["Accept-Ranges"] == "bytes"

    def test_range_206(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(
            reverse("video_stream", args=["视频夹", "a.mp4"]), HTTP_RANGE="bytes=2-5"
        )
        assert resp.status_code == 206
        assert resp["Content-Range"] == "bytes 2-5/10"
        assert b"".join(resp.streaming_content) == b"2345"

    def test_range_open_end(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(
            reverse("video_stream", args=["视频夹", "a.mp4"]), HTTP_RANGE="bytes=8-"
        )
        assert resp.status_code == 206
        assert b"".join(resp.streaming_content) == b"89"

    def test_range_out_of_bounds_416(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(
            reverse("video_stream", args=["视频夹", "a.mp4"]), HTTP_RANGE="bytes=20-30"
        )
        assert resp.status_code == 416

    def test_missing_file_404(self, auth_client, media_root):
        _make_video_folder(media_root)
        resp = auth_client.get(reverse("video_stream", args=["视频夹", "nope.mp4"]))
        assert resp.status_code == 404

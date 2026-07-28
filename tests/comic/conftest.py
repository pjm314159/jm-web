"""comic 模块测试 fixtures：Album/Photo 工厂 + 临时 media 根目录。"""

from pathlib import Path

import pytest
from comic.models import Album, Photo


@pytest.fixture
def album(db):
    """一个含封面的本子。"""
    return Album.objects.create(
        jm_id="12345",
        name="测试本子",
        author="测试作者",
        tags=["tag1", "tag2"],
        actors=["角色A"],
        description="简介",
        total_episodes=2,
        cover_path="images/jmcomic/测试本子/cover.png",
    )


@pytest.fixture
def photo(album):
    """album 下已下载的第一章。"""
    return Photo.objects.create(
        album=album,
        jm_id="67890",
        name="第一章",
        sort_index=1,
        is_downloaded=True,
        save_path="images/jmcomic/测试本子/第一章",
    )


@pytest.fixture
def photo2(album):
    """album 下未下载的第二章。"""
    return Photo.objects.create(
        album=album,
        jm_id="67891",
        name="第二章",
        sort_index=2,
        is_downloaded=False,
    )


@pytest.fixture
def media_root(tmp_path, settings):
    """临时 media 根目录，隔离真实媒体文件。"""
    root = tmp_path / "media"
    root.mkdir(parents=True, exist_ok=True)
    settings.MEDIA_ROOT = str(root)
    return Path(root)

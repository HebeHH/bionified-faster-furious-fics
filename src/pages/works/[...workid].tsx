import { MemoizedChapter } from '@/components/Chapter';
import useRegisterChaptersInMenu from '@/components/CommandBar/SubMenus/useRegisterChaptersInMenu';
import { RootState } from '@/components/Redux-Store/ReduxStore';
import {
  jumpToChapter,
  setChapterMeta,
  setCurrentChapter,
  setScroll,
  setWorkInfo,
} from '@/components/Redux-Store/WorksSlice';
import { GetServerSidePropsContext } from 'next';
import { ParsedUrlQuery } from 'querystring';
import React, { useEffect } from 'react';
import { getWorkId, loadWork } from 'utils/fics';
import { getChapterScrollPosition, SHORT_PAUSE_MS } from 'utils/scroll';
import { ALLOWED_COOKIES, AO3Work, UserWorkInfo } from 'utils/types';
import debounce from 'lodash/debounce';
import {
  DisplayPreferences,
  loadServerDisplayPreferences,
  setUsername,
} from '@/components/Redux-Store/UserSlice';
import Head from 'next/head';
import { NavBar } from '@/components/Navbar';
import useSubscribeActions from '@/components/CommandBar/SubMenus/useSubscribeActions';
import useFocusActions from '@/components/CommandBar/SubMenus/useFocusActions';
import useSpeedReadingActions from '@/components/CommandBar/SubMenus/useSpeedReadingActions';
import { Meta } from '@/components/Meta';
import {
  fetchServerHighlights,
  highlightJumpFinished,
  requestJumpToHighlight,
  selectSavedHighlight,
} from '@/components/Redux-Store/HighlightSlice';
import {
  useAppStoreDispatch,
  useAppStoreSelector,
} from '@/components/Redux-Store/hooks';
import { makeRandomString } from 'utils/misc';
import { DEVICE_ID_COOKIE } from 'utils/auth';
import {
  getDisplayPreferences,
  getUserWorkInfo,
  savePausedPosition,
} from 'utils/server';
import { useServerDisplayPreferences } from '@/components/hooks/useServerDisplayPreferences';

const WorkPage = (props: {
  work: AO3Work;
  cookies: string[] | null;
  selectedChapter: number | null;
  selectedHighlightId: number | null;
  displayPreferences: null | DisplayPreferences;
  userWorkInfo: UserWorkInfo | null;
  deviceId: string;
}) => {
  const {
    work,
    cookies,
    selectedChapter,
    selectedHighlightId,
    deviceId,
    displayPreferences,
    userWorkInfo,
  } = props;
  const dispatch = useAppStoreDispatch();
  const jumpedChapter = useAppStoreSelector(
    (state: RootState) => state.work.jumpToChapter,
  );

  const username = useAppStoreSelector((state) => state.user.username);

  const colorTheme = useAppStoreSelector(
    (state) => state.user.displayPreferences.theme,
  );

  const availableJumpToHighlight = useAppStoreSelector(
    (state) => state.highlight.jumpToHighlight?.availableHighlight,
  );

  useEffect(() => {
    const deviceCookieExpiry = new Date();
    deviceCookieExpiry.setDate(deviceCookieExpiry.getDate() + 365);
    document.cookie =
      DEVICE_ID_COOKIE +
      '=' +
      deviceId +
      '; expires=' +
      deviceCookieExpiry.toUTCString() +
      '; path=/';

    dispatch(
      loadServerDisplayPreferences({
        deviceId,
        displayPreferences,
      }),
    );

    if (userWorkInfo) {
      if (!availableJumpToHighlight && userWorkInfo.lastPausedPosition) {
        dispatch(
          setScroll({
            chapterId: userWorkInfo.lastPausedPosition.chapterId,
            scrollPercentage: userWorkInfo.lastPausedPosition.scrollPosition,
          }),
        );
        dispatch(jumpToChapter(userWorkInfo.lastPausedPosition.chapterId));
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    if (availableJumpToHighlight) {
      dispatch(jumpToChapter(availableJumpToHighlight.chapterId));
      dispatch(selectSavedHighlight(availableJumpToHighlight.id));
      dispatch(highlightJumpFinished());
    }
  }, [availableJumpToHighlight]);

  useEffect(() => {
    if (selectedHighlightId) {
      dispatch(requestJumpToHighlight(selectedHighlightId));
    }
  }, [selectedHighlightId]);

  useEffect(() => {
    dispatch(setWorkInfo(work.meta));
    dispatch(setUsername(work?.meta.username || null));
  }, [dispatch, work.meta]);

  useSubscribeActions();
  useFocusActions();
  useSpeedReadingActions();

  useServerDisplayPreferences();

  useEffect(() => {
    let intervalRefresh: NodeJS.Timer | null;

    if (work.meta) {
      dispatch(fetchServerHighlights({ workId: work.meta.id }));

      intervalRefresh = setInterval(() => {
        console.log('Fetching highlights...');
        dispatch(fetchServerHighlights({ workId: work.meta.id }));
      }, 120000);
    }

    return () => {
      if (intervalRefresh) clearInterval(intervalRefresh);
    };
  }, [dispatch, work.meta]);

  useEffect(() => {
    const markPaused = debounce((chapterId: number, scrollPosition: number) => {
      if (username) {
        savePausedPosition(username, work.meta.id, {
          chapterId,
          scrollPosition,
        });
      }
    }, SHORT_PAUSE_MS);

    const saveScrollPosition = debounce(() => {
      const { chapterId, scrollPosition } = getChapterScrollPosition(
        document,
        work?.chapters.map((chapter) => chapter.meta) || [],
      );
      dispatch(
        setScroll({ chapterId, scrollPercentage: scrollPosition * 100 }),
      );
      markPaused(chapterId, scrollPosition);
      return;
    }, 100);

    if (document) {
      document.addEventListener('scroll', saveScrollPosition, {
        passive: true,
      });
    }

    return () => {
      saveScrollPosition.cancel();
      markPaused.cancel();
      document.removeEventListener('scroll', saveScrollPosition);
    };
  }, [work, dispatch]);

  useEffect(() => {
    dispatch(
      setChapterMeta(work?.chapters.map((chapter) => chapter.meta) || []),
    );
  }, [work, dispatch]);

  useEffect(() => {
    if (selectedChapter && !userWorkInfo?.lastPausedPosition)
      dispatch(jumpToChapter(selectedChapter));
  }, [selectedChapter, dispatch]);

  useEffect(() => {
    dispatch(
      setCurrentChapter(selectedChapter || work?.chapters[0].meta.id || 0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (window as any).work = work;
    if (cookies) {
      cookies.map(
        (cookie) => (document.cookie = cookie.replace(/HttpOnly/i, '')),
      );
    }
  });

  useRegisterChaptersInMenu(
    work?.chapters.map((chapter) => ({
      name: chapter.meta.title,
      count: chapter.meta.count,
      id: chapter.meta.id,
    })) || [],
    work?.chapters.length || 0,
  );

  return (
    <>
      <NavBar />
      <Head>
        <title>{work?.meta.title + ' - BF3' || 'FuriousFics'}</title>
      </Head>
      <div className="work">
        <div className="work_meta_data">
          <Meta contentHTML={work.meta.summaryHTML} title="Summary" />
          <Meta contentHTML={work.meta.startNotesHTML} title="Notes" />
        </div>
        <div>
          {work?.chapters.map((chapter) => (
            <MemoizedChapter
              jumpToThisChapter={
                (jumpedChapter && jumpedChapter === chapter.meta.id) || false
              }
              chapter={chapter}
              key={chapter.meta.id}
            />
          ))}
        </div>
        <hr />
        <div className="work_meta_data">
          <Meta contentHTML={work.meta.endNotesHTML} title="End Notes" />
        </div>
      </div>
    </>
  );
};

function getHighlightIdFromQuery(query: ParsedUrlQuery) {
  if (Array.isArray(query.workid)) {
    const cIndex = query.workid.findIndex((token) => token === 'highlight');
    if (
      cIndex !== -1 &&
      query.workid.length >= cIndex + 2 &&
      !isNaN(parseInt((query.workid as string[])[cIndex + 1]))
    )
      return parseInt((query.workid as string[])[cIndex + 1]);
  }
  return null;
}

function getChapterFromQuery(query: ParsedUrlQuery) {
  if (Array.isArray(query.workid)) {
    const cIndex = query.workid.findIndex((token) => token === 'chapters');
    if (
      cIndex !== -1 &&
      query.workid.length >= cIndex + 2 &&
      !isNaN(parseInt((query.workid as string[])[cIndex + 1]))
    )
      return parseInt((query.workid as string[])[cIndex + 1]);
  }
  return null;
}

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const allowedCookies = ALLOWED_COOKIES.reduce((acc, cur) => {
    const cookie = ctx.req.cookies[cur];
    if (cookie) acc.push(`${cur}=${cookie}`);
    return acc;
  }, [] as string[]);

  const deviceId = ctx.req.cookies[DEVICE_ID_COOKIE] || makeRandomString(10);

  const selectedChapter = getChapterFromQuery(ctx.query);
  const selectedHighlightId = getHighlightIdFromQuery(ctx.query);

  if (ctx.query.workid) {
    const workId = getWorkId(
      Array.isArray(ctx.query.workid) ? ctx.query.workid[0] : ctx.query.workid,
    );
    if (!workId)
      return {
        redirect: {
          permanent: false,
          destination: '/login?ficnotfound=true',
        },
      };

    if (allowedCookies.length < 2) {
      return {
        redirect: {
          permanent: false,
          destination: `/login?when_successful=${ctx.resolvedUrl}`,
        },
      };
    }
    const workData = await loadWork(workId, allowedCookies);

    if ('failed' in workData) {
      if (workData.reason === 'AuthFailed')
        return {
          redirect: {
            permanent: false,
            destination: `/login?when_successful=${ctx.resolvedUrl}`,
          },
        };
      else
        return {
          redirect: {
            permanent: false,
            destination: '/login?ficnotfound=true',
          },
        };
    }

    let displayPreferences = null,
      userWorkInfo = null;

    if (workData.work && workData.work && workData.work.meta.username) {
      displayPreferences = await getDisplayPreferences(
        workData.work.meta.username,
        deviceId,
      );

      userWorkInfo = await getUserWorkInfo(
        workData.work.meta.username,
        workData.work.meta.id,
      );
    }

    return {
      props: {
        work: workData?.work || null,
        cookies: workData?.cookies || null,
        displayPreferences,
        userWorkInfo,
        deviceId,
        selectedChapter,
        selectedHighlightId,
      },
    };
  } else {
    return {
      redirect: {
        permanent: false,
        destination: '/login?ficnotfound=true',
      },
    };
  }
};

export default WorkPage;

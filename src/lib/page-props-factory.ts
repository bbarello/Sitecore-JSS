import { ParsedUrlQuery } from 'querystring';
import { GetServerSidePropsContext, GetStaticPropsContext } from 'next';
import {
  ComponentPropsService,
  DictionaryPhrases,
  DictionaryService,
  LayoutServiceData,
  LayoutService,
  editingDataService,
} from '@sitecore-jss/sitecore-jss-nextjs';
import { SitecorePageProps } from 'lib/page-props';
import { dictionaryServiceFactory } from 'lib/dictionary-service-factory';
import { layoutServiceFactory } from 'lib/layout-service-factory';
import { componentModule } from 'temp/componentFactory';
import pkg from '../../package.json';
import { OnfsSitecoreContextValue } from './component-props';
import { getSession, GetSessionParams } from 'next-auth/react';

/**
 * Extract normalized Sitecore item path from query
 * @param {ParsedUrlQuery | undefined} params
 */
function extractPath(params: ParsedUrlQuery | undefined): string {
  if (params === undefined) {
    return '/';
  }
  let path = Array.isArray(params.path) ? params.path.join('/') : params.path ?? '/';

  // Ensure leading '/'
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  return path;
}

/**
 * Determines whether context is GetServerSidePropsContext (SSR) or GetStaticPropsContext (SSG)
 * @param {GetServerSidePropsContext | GetStaticPropsContext} context
 */
const isServerSidePropsContext = function (
  context: GetServerSidePropsContext | GetStaticPropsContext
): context is GetServerSidePropsContext {
  return (<GetServerSidePropsContext>context).req !== undefined;
};

export class SitecorePagePropsFactory {
  private componentPropsService: ComponentPropsService;
  private dictionaryService: DictionaryService;
  private layoutService: LayoutService;

  constructor() {
    this.componentPropsService = new ComponentPropsService();
    this.dictionaryService = dictionaryServiceFactory.create();
    this.layoutService = layoutServiceFactory.create();
  }

  /**
   * Create SitecorePageProps for given context (SSR / GetServerSidePropsContext or SSG / GetStaticPropsContext)
   * @param {GetServerSidePropsContext | GetStaticPropsContext} context
   * @see SitecorePageProps
   */
  public async create(
    context: GetServerSidePropsContext | GetStaticPropsContext
  ): Promise<SitecorePageProps> {
    let locale: string,
      layoutData: LayoutServiceData | null,
      dictionary: DictionaryPhrases,
      componentProps = {},
      notFound = false,
      sitecoreContext: OnfsSitecoreContextValue | null = null,
      unauthorized = false;
    const session = await getSession(context as GetSessionParams);

    if (context.preview) {
      /**
       * Preview mode
       */
      // If we're in preview (editing) mode, use data already sent along with the editing request
      const data = await editingDataService.getEditingData(context.previewData);
      if (!data) {
        throw new Error(
          `Unable to get editing data for preview ${JSON.stringify(context.previewData)}`
        );
      }
      locale = data.language;
      layoutData = data.layoutData;
      dictionary = data.dictionary;
    } else {
      /**
       * Normal mode
       */
      // Get normalized Sitecore item path
      const path = extractPath(context.params);

      // Use context locale if Next.js i18n is configured, otherwise use language defined in package.json
      locale = context.locale ?? pkg.config.language;

      if (session) {
        this.layoutService = layoutServiceFactory.create(session);
      }

      // Fetch layout data, passing on req/res for SSR
      layoutData = await this.layoutService
        .fetchLayoutData(
          path,
          locale,
          // eslint-disable-next-line prettier/prettier
          isServerSidePropsContext(context)
            ? (context as GetServerSidePropsContext).req
            : undefined,
          isServerSidePropsContext(context) ? (context as GetServerSidePropsContext).res : undefined
        )
        .catch((error) => {
          console.log(error);
          if (error.response?.status === 404) {
            // Let 404s (invalid path) through, and set notFound.
            // Our page routes will return this in getStatic/ServerSideProps,
            // which will trigger our custom 404 page with proper 404 status code.
            // You could perform additional logging here to track these if desired.
            notFound = true;
            return null;
          }
          if (error.response?.status === 401) {
            // Let 401s (unauthorized) through, and set unauthorized.
            unauthorized = true;
            return null;
          }
          throw error;
        });

      if (!layoutData?.sitecore.route) {
        // A missing route value signifies an invalid path, so set notFound.
        // Our page routes will return this in getStatic/ServerSideProps,
        // which will trigger our custom 404 page with proper 404 status code.
        // You could perform additional logging here to track these if desired.
        notFound = true;
      }

      // Fetch dictionary data
      dictionary = await this.dictionaryService.fetchDictionaryData(locale);
    }

    // Retrieve component props using side-effects defined on components level
    if (layoutData?.sitecore?.route) {
      sitecoreContext = {
        route: layoutData.sitecore.route,
        itemId: layoutData.sitecore.route?.itemId,
        ...layoutData.sitecore.context,
      };

      if (isServerSidePropsContext(context)) {
        componentProps = await this.componentPropsService.fetchServerSideComponentProps({
          layoutData,
          context,
          componentModule,
        });
      } else {
        componentProps = await this.componentPropsService.fetchStaticComponentProps({
          layoutData,
          context,
          componentModule,
        });
      }
    }

    return {
      locale,
      dictionary,
      sitecoreContext,
      componentProps,
      notFound,
      unauthorized,
    };
  }
}

export const sitecorePagePropsFactory = new SitecorePagePropsFactory();

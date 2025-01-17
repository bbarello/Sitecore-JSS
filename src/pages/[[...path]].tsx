import { useEffect } from 'react';
import { GetServerSideProps } from 'next';
import NotFound from 'src/NotFound';
import {
  SitecoreContext,
  ComponentPropsContext,
  handleEditorFastRefresh,
} from '@sitecore-jss/sitecore-jss-nextjs';
import Layout from 'src/Layout';
import { SitecorePageProps } from 'lib/page-props';
import { sitecorePagePropsFactory } from 'lib/page-props-factory';
import { componentFactory } from 'temp/componentFactory';
import { OnfsSitecoreContextValue } from 'lib/component-props';
import Unauthorized from 'src/Unauthorized';

const SitecorePage = ({
  notFound,
  componentProps,
  sitecoreContext,
  unauthorized,
}: SitecorePageProps): JSX.Element => {
  useEffect(() => {
    // Since Sitecore editors do not support Fast Refresh, need to refresh EE chromes after Fast Refresh finished
    handleEditorFastRefresh();
  }, []);

  if (unauthorized) {
    return <Unauthorized />;
  }

  if (notFound || !sitecoreContext?.route) {
    // Shouldn't hit this (as long as 'notFound' is being returned below), but just to be safe
    return <NotFound />;
  }

  return (
    <ComponentPropsContext value={componentProps}>
      <SitecoreContext<OnfsSitecoreContextValue>
        componentFactory={componentFactory}
        context={sitecoreContext}
      >
        <Layout />
      </SitecoreContext>
    </ComponentPropsContext>
  );
};

// This function gets called at request time on server-side.
export const getServerSideProps: GetServerSideProps = async (context) => {
  const props = await sitecorePagePropsFactory.create(context);

  //console.log(props);

  // Returns custom 404 page with a status code of 404 when notFound: true
  // Note we can't simply return props.notFound due to an issue in Next.js (https://github.com/vercel/next.js/issues/22472)
  const notFound = props.notFound ? { notFound: true } : {};

  return {
    props,
    ...notFound,
  };
};

export default SitecorePage;

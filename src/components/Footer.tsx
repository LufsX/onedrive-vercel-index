import config from '../../config/site.config'

const createFooterMarkup = () => {
  return {
    __html: config.footer,
  }
}

const Footer = () => {
  return (
    <div
      className="w-full border-t border-gray-900/10 bg-gray-50/30 p-4 text-center text-xs font-medium text-gray-500 dark:border-gray-500/30 dark:bg-gray-900/30 dark:text-gray-400"
      dangerouslySetInnerHTML={createFooterMarkup()}
    ></div>
  )
}

export default Footer
